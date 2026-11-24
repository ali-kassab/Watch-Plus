import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { AppConfig } from '../../config/app-config.service.js';

export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends e-mail through SMTP (MAIL_TRANSPORT=smtp) or, for local development,
 * writes the message to the log (MAIL_TRANSPORT=log). Credentials never leave the server.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  constructor(private readonly config: AppConfig) {}

  async send(message: MailMessage): Promise<{ transport: 'smtp' | 'log'; messageId?: string }> {
    if (this.config.get('MAIL_TRANSPORT') === 'log') {
      const preview = this.config.isProduction ? undefined : message.text;
      this.logger.log({ msg: 'email (log transport)', to: message.to, subject: message.subject, body: preview });
      return { transport: 'log' };
    }
    const info = await this.getTransporter().sendMail({
      from: this.config.get('MAIL_FROM'),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { transport: 'smtp', messageId: info.messageId };
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const user = this.config.get('SMTP_USER');
      this.transporter = nodemailer.createTransport({
        host: this.config.get('SMTP_HOST'),
        port: this.config.get('SMTP_PORT'),
        secure: this.config.get('SMTP_SECURE'),
        auth: user ? { user, pass: this.config.get('SMTP_PASSWORD') } : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
    }
    return this.transporter;
  }
}
