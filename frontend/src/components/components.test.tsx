import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IncidentTimeline } from "@/components/incidents/incident-timeline";
import { IncidentUpdateForm } from "@/components/incidents/incident-update-form";
import { ChannelDialog } from "@/components/notifications/channel-dialog";
import { UptimeHistory, uptimeLevel } from "@/components/status/uptime-history";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { IncidentUpdate, NotificationChannel } from "@/lib/types";

describe("IncidentUpdateForm", () => {
  it("validates, then posts a public update without a status change", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<IncidentUpdateForm current="INVESTIGATING" resolved={false} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Post update" }));
    expect(await screen.findByText("Write an update")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByRole("textbox"), "Fix is rolling out");
    await userEvent.click(screen.getByRole("button", { name: "Post update" }));
    expect(onSubmit).toHaveBeenCalledWith({ message: "Fix is rolling out", isInternal: false, status: undefined });
    expect(screen.getByRole("textbox")).toHaveValue(""); // reset after success
  });

  it("hides the status picker for internal notes", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<IncidentUpdateForm current="OPEN" resolved={false} onSubmit={onSubmit} />);
    expect(screen.getByRole("combobox", { name: "New status" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Internal note" }));
    expect(screen.queryByRole("combobox", { name: "New status" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox"), "Paged the DB team");
    await userEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(onSubmit).toHaveBeenCalledWith({ message: "Paged the DB team", isInternal: true, status: undefined });
  });

  it("only allows internal notes on resolved incidents and keeps the draft when posting fails", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("boom"));
    render(<IncidentUpdateForm current="RESOLVED" resolved onSubmit={onSubmit} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox"), "Postmortem scheduled");
    await userEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(onSubmit).toHaveBeenCalledWith({ message: "Postmortem scheduled", isInternal: true, status: undefined });
    expect(screen.getByRole("textbox")).toHaveValue("Postmortem scheduled");
  });
});

describe("ChannelDialog", () => {
  it("creates an e-mail channel with all events selected by default", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ChannelDialog onClose={() => {}} onSubmit={onSubmit} />);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add channel" }));
    expect(await within(dialog).findByText("Name is required")).toBeInTheDocument();
    expect(within(dialog).getByText("Add at least one e-mail address")).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText("Name"), "On-call");
    await userEvent.type(within(dialog).getByLabelText("Recipients"), "ops@example.com, oncall@example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add channel" }));
    expect(onSubmit).toHaveBeenCalledWith({
      type: "EMAIL", name: "On-call", isEnabled: true,
      events: ["MONITOR_DOWN", "MONITOR_RECOVERED", "INCIDENT_UPDATED"],
      recipients: ["ops@example.com", "oncall@example.com"],
    });
  });

  it("edits a webhook without resending its masked URL", async () => {
    const channel: NotificationChannel = {
      id: "c1", type: "WEBHOOK", name: "Relay", events: ["MONITOR_DOWN"], isEnabled: true,
      target: { url: "https://hooks.example.com/…abcd", hasSecret: true }, createdAt: "",
    };
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ChannelDialog channel={channel} onClose={() => {}} onSubmit={onSubmit} />);
    expect(screen.queryByLabelText("Type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Signing secret/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Webhook URL")).toHaveAttribute("placeholder", "https://hooks.example.com/…abcd");
    await userEvent.click(screen.getByRole("checkbox", { name: "Monitor recovered" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSubmit).toHaveBeenCalledWith({ name: "Relay", events: ["MONITOR_DOWN", "MONITOR_RECOVERED"], isEnabled: true });
  });
});

describe("IncidentTimeline", () => {
  it("labels entries, marks internal notes and attributes automatic updates", () => {
    const updates: IncidentUpdate[] = [
      { id: "2", type: "NOTE", status: null, message: "Team only", isInternal: true, createdAt: new Date().toISOString(), author: { id: "u", name: "Ali" } },
      { id: "1", type: "CREATED", status: "OPEN", message: "Automatically opened", isInternal: false, createdAt: new Date().toISOString(), author: null },
    ];
    render(<IncidentTimeline updates={updates} />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("Internal note")).toBeInTheDocument();
    expect(within(items[0]).getByText("(team only)")).toBeInTheDocument();
    expect(within(items[1]).getByText("Incident opened")).toBeInTheDocument();
    expect(within(items[1]).getByText("PulseWatch")).toBeInTheDocument();
  });

  it("shows an empty state", () => {
    render(<IncidentTimeline updates={[]} />);
    expect(screen.getByText("No updates yet.")).toBeInTheDocument();
  });
});

describe("UptimeHistory", () => {
  it("maps uptime to status levels", () => {
    expect([100, 99.9, 99.5, 97, 50, null].map(uptimeLevel)).toEqual(["good", "good", "warning", "serious", "critical", "none"]);
  });

  it("renders one accessible, focusable cell per day", () => {
    render(
      <TooltipProvider>
        <UptimeHistory name="API" history={[{ date: "2026-11-23", uptimePercent: 99.95 }, { date: "2026-11-24", uptimePercent: null }]} />
      </TooltipProvider>,
    );
    const cells = within(screen.getByRole("list", { name: "API: daily uptime history" })).getAllByRole("listitem");
    expect(cells.map((c) => c.getAttribute("aria-label"))).toEqual(["Nov 23, 2026: 99.95% uptime", "Nov 24, 2026: no data"]);
    expect(cells[0]).toHaveAttribute("tabindex", "0");
  });
});
