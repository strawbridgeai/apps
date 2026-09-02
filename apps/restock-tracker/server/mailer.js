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

function sightingEmail({ to, retailer, title, url, unsubscribeUrl }) {
  return sendMail({
    to,
    subject: `Possible restock (${retailer}): ${title}`,
    text:
      `Someone on r/PokemonRestocks just posted about a possible ${retailer} restock:\n\n` +
      `"${title}"\n${url}\n\n` +
      `This is a community report, not independently verified against ${retailer}'s own site — ` +
      `double-check it's actually still there before making a trip.\n\n` +
      `This is an alert only — nothing was purchased on your behalf.\n\n` +
      `Stop alerts like this: ${unsubscribeUrl}`,
  });
}

function newListingEmail({ to, retailer, name, unsubscribeUrl }) {
  return sendMail({
    to,
    subject: `New listing at ${retailer}: ${name}`,
    text:
      `A new product just appeared in ${retailer}'s Pokémon TCG search results:\n\n${name}\n\n` +
      `New listings often show up before the actual on-sale/restock date, so this may not be ` +
      `purchasable yet — check ${retailer}'s site directly.\n\n` +
      `This is an alert only — nothing was purchased on your behalf.\n\n` +
      `Stop alerts like this: ${unsubscribeUrl}`,
  });
}

module.exports = { sendMail, restockEmail, sightingEmail, newListingEmail };
