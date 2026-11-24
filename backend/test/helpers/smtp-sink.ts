import { SMTPServer } from 'smtp-server';

export interface ReceivedMail {
  to: string[];
  raw: string;
}

/** Minimal in-process SMTP server so e-mail delivery is tested over real SMTP. */
export async function startSmtpSink(port = 2526) {
  const messages: ReceivedMail[] = [];
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    logger: false,
    onData(stream, session, callback) {
      let raw = '';
      stream.on('data', (c: Buffer) => (raw += c.toString()));
      stream.on('end', () => {
        messages.push({ to: session.envelope.rcptTo.map((r) => r.address), raw });
        callback();
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return { messages, close: () => new Promise<void>((r) => server.close(() => r())) };
}
