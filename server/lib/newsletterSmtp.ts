/**
 * SMTP ohne Zusatzpaket. Port 465 spricht TLS von Anfang an, Port 587
 * STARTTLS. Der Dialog selbst ist ohne Socket testbar.
 */
import net from "node:net";
import tls from "node:tls";
import type { ParsedFrom } from "./newsletterMail.js";
import { encodeHeader } from "./newsletterMail.js";
import type { OutboundMail } from "./newsletterMessages.js";

export interface SmtpIo {
  readLine: () => Promise<string>;
  writeLine: (line: string) => void;
  writeRaw: (chunk: string) => void;
}

export function dotStuff(body: string): string {
  const text = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const stuffed = text.split("\n").map(line => (line.startsWith(".") ? `.${line}` : line)).join("\r\n");
  return stuffed.endsWith("\r\n") ? stuffed : `${stuffed}\r\n`;
}

export function buildMime(mail: OutboundMail, fromHeader: string): string {
  for (const value of [fromHeader, mail.to, mail.subject, mail.unsubscribeUrl]) {
    if (/[\r\n]/.test(value)) throw new Error("Mail-Header enthält einen Zeilenumbruch");
  }
  const boundary = `rv-${Math.random().toString(16).slice(2)}`;
  return [
    `From: ${fromHeader}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    `List-Unsubscribe: <${mail.unsubscribeUrl}>`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    mail.text,
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    mail.html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export async function readSmtpReply(readLine: () => Promise<string>): Promise<{ code: number; text: string }> {
  const lines: string[] = [];
  for (;;) {
    const line = await readLine();
    if (!/^\d{3}[ -]/.test(line)) throw new Error("SMTP-Antwort unleserlich");
    lines.push(line);
    if (line[3] === " ") return { code: Number(line.slice(0, 3)), text: lines.join("\n") };
  }
}

async function expect(io: SmtpIo, code: number, label: string): Promise<void> {
  const reply = await readSmtpReply(io.readLine);
  if (reply.code !== code) throw new Error(`${label} ${reply.code}`);
}

export async function smtpTransaction(
  io: SmtpIo,
  mail: { from: string; to: string; data: string; user?: string; pass?: string },
  expectGreeting = true,
): Promise<void> {
  if (expectGreeting) await expect(io, 220, "Gruß");
  io.writeLine("EHLO resonanzvernunft");
  await expect(io, 250, "EHLO");
  if (mail.user && mail.pass) {
    io.writeLine("AUTH LOGIN");
    await expect(io, 334, "AUTH");
    io.writeLine(Buffer.from(mail.user, "utf8").toString("base64"));
    await expect(io, 334, "AUTH-User");
    io.writeLine(Buffer.from(mail.pass, "utf8").toString("base64"));
    await expect(io, 235, "AUTH-Pass");
  }
  io.writeLine(`MAIL FROM:<${mail.from}>`);
  await expect(io, 250, "MAIL");
  io.writeLine(`RCPT TO:<${mail.to}>`);
  const rcpt = await readSmtpReply(io.readLine);
  if (rcpt.code !== 250 && rcpt.code !== 251) throw new Error(`RCPT ${rcpt.code}`);
  io.writeLine("DATA");
  await expect(io, 354, "DATA");
  io.writeRaw(`${dotStuff(mail.data)}.\r\n`);
  await expect(io, 250, "Körper");
  io.writeLine("QUIT");
}

function lineReader(socket: net.Socket): () => Promise<string> {
  let buf = "";
  const queued: string[] = [];
  const waiters: Array<{ resolve: (line: string) => void; reject: (err: Error) => void }> = [];
  let failed: Error | null = null;
  socket.setEncoding("utf8");
  const fail = (err: Error) => {
    if (failed) return;
    failed = err;
    while (waiters.length) waiters.shift()?.reject(err);
  };
  socket.on("error", err => fail(err));
  socket.on("timeout", () => {
    fail(new Error("SMTP-Zeitüberschreitung"));
    socket.destroy();
  });
  socket.on("data", (chunk: string) => {
    buf += chunk;
    let idx = buf.indexOf("\n");
    while (idx >= 0) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const waiter = waiters.shift();
      if (waiter) waiter.resolve(line);
      else queued.push(line);
      idx = buf.indexOf("\n");
    }
  });
  return () => {
    if (queued.length) return Promise.resolve(queued.shift() as string);
    if (failed) return Promise.reject(failed);
    return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  };
}

export async function smtpSend(mail: OutboundMail, from: ParsedFrom): Promise<void> {
  const host = (process.env.NEWSLETTER_SMTP_HOST ?? "").trim();
  const port = Number(process.env.NEWSLETTER_SMTP_PORT || 465);
  if (!host || !Number.isFinite(port)) throw new Error("SMTP-Host fehlt");
  const user = (process.env.NEWSLETTER_SMTP_USER ?? "").trim() || undefined;
  const pass = process.env.NEWSLETTER_SMTP_PASS || undefined;
  const secure = port === 465;
  const socket: net.Socket = secure
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });
  socket.setTimeout(20_000);
  await new Promise<void>((resolve, reject) => {
    const done = () => resolve();
    socket.once(secure ? "secureConnect" : "connect", done);
    socket.once("error", reject);
  });
  const readLine = lineReader(socket);
  const io: SmtpIo = {
    readLine,
    writeLine: line => socket.write(`${line}\r\n`),
    writeRaw: chunk => socket.write(chunk),
  };
  try {
    if (!secure) {
      await expect(io, 220, "Gruß");
      io.writeLine("EHLO resonanzvernunft");
      await expect(io, 250, "EHLO");
      io.writeLine("STARTTLS");
      await expect(io, 220, "STARTTLS");
      const upgraded = tls.connect({ socket, servername: host });
      await new Promise<void>((resolve, reject) => {
        upgraded.once("secureConnect", () => resolve());
        upgraded.once("error", reject);
      });
      upgraded.setTimeout(20_000);
      const secureIo: SmtpIo = {
        readLine: lineReader(upgraded),
        writeLine: line => upgraded.write(`${line}\r\n`),
        writeRaw: chunk => upgraded.write(chunk),
      };
      await smtpTransaction(secureIo, {
        from: from.email,
        to: mail.to,
        data: buildMime(mail, from.header),
        user,
        pass,
      }, false);
      upgraded.end();
      return;
    }
    await smtpTransaction(io, {
      from: from.email,
      to: mail.to,
      data: buildMime(mail, from.header),
      user,
      pass,
    }, true);
  } finally {
    socket.end();
  }
}
