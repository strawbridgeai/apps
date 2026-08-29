// Local sendmail (the exim symlink already handling this domain's mail) -
// no new dependency, no new account/cost, matches the plan's email-only
// v1 scope.
const { execFile } = require('child_process');

const FROM = process.env.ALERT_FROM_EMAIL || 'alerts@strawbridgeai.com';
const SENDMAIL = '/usr/sbin/sendmail';

function sendMail({ to, subject, text }) {
  return new Promise((resolve, reject) => {
    const message =
      `From: Restock Radar <${FROM}>\r\n` +
      `To: ${to}\r\n` +
      `Subject: ${subject}\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
      `${text}\r\n`;
    const child = execFile(SENDMAIL, ['-t', '-f', FROM], (err) => {
      if (err) reject(err);
      else resolve();
    });
    child.stdin.write(message);
    child.stdin.end();
  });
}

function restockEmail({ to, productName, storeName, retailer, buyUrl, unsubscribeUrl }) {
  return sendMail({
    to,
    subject: `Restock: ${productName} — ${storeName}`,
    text:
      `${productName} is now showing in stock at ${storeName} (${retailer}).\n\n` +
      (buyUrl ? `Buy it here: ${buyUrl}\n\n` : '') +
      `This is an alert only — nothing was purchased on your behalf. Stock can disappear` +
      ` fast once a restock is spotted, so double-check it's still there before making a trip.\n\n` +
      `Stop alerts for this item: ${unsubscribeUrl}`,
  });
}

module.exports = { sendMail, restockEmail };
