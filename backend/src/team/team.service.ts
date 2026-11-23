import { BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service.js';
import { MailService } from '../common/mail/mail.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { generateOpaqueToken, sha256 } from '../common/security/tokens.js';
import { Role } from '../generated/prisma/enums.js';
import type { MembershipContext } from '../workspaces/membership.decorator.js';
import type { CreateInvitationDto, UpdateMemberDto } from './team.schemas.js';
import { assertCanAssignRole, assertCanManageMember } from './team.policy.js';

const INVITATION_TTL_MS = 7 * 86_400_000;

@Injectable()
export class TeamService {
  private readonly logger = new Logger(TeamService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
  ) {}

  async listMembers(workspaceId: string) {
    const members = await this.prisma.membership.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((m) => ({ id: m.id, role: m.role, joinedAt: m.createdAt, user: m.user }));
  }

  async updateMember(actor: MembershipContext, memberId: string, dto: UpdateMemberDto) {
    const target = await this.findMember(actor.workspaceId, memberId);
    assertCanManageMember(actor.role, target.role);
    assertCanAssignRole(actor.role, dto.role);
    if (target.role === Role.OWNER && dto.role !== Role.OWNER) await this.assertNotLastOwner(actor.workspaceId);
    const updated = await this.prisma.membership.update({ where: { id: target.id }, data: { role: dto.role } });
    this.logger.log({ msg: 'member role changed', workspaceId: actor.workspaceId, memberId, role: dto.role });
    return { id: updated.id, role: updated.role };
  }

  async removeMember(actor: MembershipContext, memberId: string) {
    const target = await this.findMember(actor.workspaceId, memberId);
    if (target.id !== actor.id) assertCanManageMember(actor.role, target.role);
    if (target.role === Role.OWNER) await this.assertNotLastOwner(actor.workspaceId);
    await this.prisma.membership.delete({ where: { id: target.id } });
    // Signed-in sessions keep their access token for its short TTL, but the workspace guard re-checks membership per request.
  }

  async leave(actor: MembershipContext) {
    return this.removeMember(actor, actor.id);
  }

  async listInvitations(workspaceId: string) {
    const invitations = await this.prisma.invitation.findMany({
      where: { workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { invitedBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map(({ tokenHash: _t, ...rest }) => rest);
  }

  /**
   * Creates an invitation and e-mails a single-use link. The raw token is only ever
   * returned once to the inviting admin (so the link can also be shared manually); only its hash is stored.
   */
  async invite(actor: MembershipContext, inviterId: string, dto: CreateInvitationDto) {
    assertCanAssignRole(actor.role, dto.role);
    const existingMember = await this.prisma.membership.findFirst({
      where: { workspaceId: actor.workspaceId, user: { email: dto.email } },
    });
    if (existingMember) throw new ConflictException('This user is already a member of the workspace');

    const token = generateOpaqueToken(32);
    const [, invitation] = await this.prisma.$transaction([
      this.prisma.invitation.updateMany({
        where: { workspaceId: actor.workspaceId, email: dto.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.invitation.create({
        data: {
          workspaceId: actor.workspaceId,
          email: dto.email,
          role: dto.role,
          invitedById: inviterId,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        },
        include: { workspace: { select: { name: true } }, invitedBy: { select: { name: true } } },
      }),
    ]);

    const inviteUrl = `${this.config.get('FRONTEND_URL')}/invite/${token}`;
    let emailSent = true;
    try {
      await this.mail.send({
        to: [dto.email],
        subject: `You're invited to join ${invitation.workspace.name} on PulseWatch`,
        text: `${invitation.invitedBy.name} invited you to join "${invitation.workspace.name}" as ${dto.role}.\n\nAccept the invitation: ${inviteUrl}\n\nThis link expires in 7 days.`,
      });
    } catch (error) {
      emailSent = false;
      this.logger.warn({ msg: 'invitation email failed', workspaceId: actor.workspaceId, error: (error as Error).message });
    }
    const { tokenHash: _t, workspace: _w, ...rest } = invitation;
    return { ...rest, inviteUrl, emailSent };
  }

  async revokeInvitation(workspaceId: string, invitationId: string) {
    const result = await this.prisma.invitation.updateMany({
      where: { id: invitationId, workspaceId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw new NotFoundException('Invitation not found');
  }

  /** Public preview used by the invitation landing page. Exposes only what the invitee needs. */
  async previewInvitation(token: string) {
    const invitation = await this.findUsableInvitation(token);
    return {
      workspaceName: invitation.workspace.name,
      role: invitation.role,
      email: invitation.email,
      invitedBy: invitation.invitedBy.name,
      expiresAt: invitation.expiresAt,
    };
  }

  async acceptInvitation(token: string, user: Express.User) {
    const invitation = await this.findUsableInvitation(token);
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenException('This invitation was sent to a different email address');
    }
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) throw new GoneException('Invitation is no longer valid');
      const membership = await tx.membership.upsert({
        where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } },
        create: { workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role },
        update: {},
      });
      return { workspaceId: membership.workspaceId, role: membership.role };
    });
  }

  private async findUsableInvitation(token: string) {
    if (!token || token.length > 128) throw new NotFoundException('Invitation not found');
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: { workspace: { select: { name: true } }, invitedBy: { select: { name: true } } },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt.getTime() < Date.now()) {
      throw new GoneException('This invitation has expired or was already used');
    }
    return invitation;
  }

  private async findMember(workspaceId: string, memberId: string) {
    const member = await this.prisma.membership.findFirst({ where: { id: memberId, workspaceId } });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  private async assertNotLastOwner(workspaceId: string) {
    const owners = await this.prisma.membership.count({ where: { workspaceId, role: Role.OWNER } });
    if (owners <= 1) throw new BadRequestException('A workspace must keep at least one owner');
  }
}
