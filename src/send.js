'use strict';

/**
 * Email the built PDF.
 *
 *   node src/send.js                     # newest PDF in out/
 *   node src/send.js out/x.pdf
 *
 * Two transports, picked by whichever credentials are present:
 *
 *   SMTP      SMTP_HOST, SMTP_PORT (default 465), SMTP_USER, SMTP_PASS
 *   Resend    RESEND_API_KEY
 *
 * Common to both: MAIL_TO (default aslockett@gmail.com), MAIL_FROM.
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { newestPdf } = require('./verify');

const ROOT = path.join(__dirname, '..');
const TO = process.env.MAIL_TO || 'aslockett@gmail.com';

/** "film-tv-updates-2026-08-13.pdf" -> the range printed on the cover. */
function subjectFor(pdfPath) {
  const issueDate = path.basename(pdfPath).replace(/^film-tv-updates-|\.pdf$/g, '');
  const contentPath = path.join(ROOT, 'content', `${issueDate}.json`);
  if (fs.existsSync(contentPath)) {
    const { rangeLabel } = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
    if (rangeLabel) return `Film+Tv Updates — ${rangeLabel}`;
  }
  return `Film+Tv Updates — ${issueDate}`;
}

const BODY = (subject) =>
  `${subject}\n\nThis week's issue is attached as a PDF.\n\n` +
  `Television · In Cinemas · Streaming (incl. Repertory & Curated) · Festivals · Wildcard\n`;

async function sendViaSmtp(pdfPath, subject) {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: TO,
    subject,
    text: BODY(subject),
    attachments: [{ filename: path.basename(pdfPath), path: pdfPath }],
  });
  return `smtp · ${info.messageId}`;
}

async function sendViaResend(pdfPath, subject) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'Film+Tv Updates <onboarding@resend.dev>',
      to: [TO],
      subject,
      text: BODY(subject),
      attachments: [
        { filename: path.basename(pdfPath), content: fs.readFileSync(pdfPath).toString('base64') },
      ],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(json)}`);
  return `resend · ${json.id}`;
}

async function send(pdfPath) {
  const subject = subjectFor(pdfPath);

  let result;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    result = await sendViaSmtp(pdfPath, subject);
  } else if (process.env.RESEND_API_KEY) {
    result = await sendViaResend(pdfPath, subject);
  } else {
    throw new Error(
      'No mail credentials. Set SMTP_HOST/SMTP_USER/SMTP_PASS, or RESEND_API_KEY. See README.'
    );
  }

  console.log(`to      : ${TO}`);
  console.log(`subject : ${subject}`);
  console.log(`attached: ${path.basename(pdfPath)} (${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB)`);
  console.log(`sent    : ${result}`);
}

if (require.main === module) {
  const arg = process.argv[2];
  const pdfPath = arg ? (path.isAbsolute(arg) ? arg : path.join(ROOT, arg)) : newestPdf();
  send(pdfPath).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { send, subjectFor };
