const twilio = require('twilio');
require('dotenv').config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const isConfigured = accountSid && authToken && fromNumber && accountSid !== 'your_sid';

let client = null;
if (isConfigured) {
  client = twilio(accountSid, authToken);
}

const smsService = {
  async sendSMS(to, body) {
    if (!isConfigured) {
      console.log(`
      📱 [SMS LOCAL SIMULATION]
      ➡️ To: ${to}
      ➡️ Message: ${body}
      `);
      return { simulated: true, sid: 'simulated_sms_' + Math.random() };
    }

    try {
      const message = await client.messages.create({
        body,
        from: fromNumber,
        to
      });
      console.log(`💬 SMS successfully sent to ${to}: ${message.sid}`);
      return message;
    } catch (err) {
      console.error('⚠️ Twilio failed to send SMS:', err.message);
      throw err;
    }
  },

  async sendUrgentAlert(to, binName, fillLevel) {
    const body = `🚨 ALERTE SUIVI-DÉCHETS: La poubelle ${binName} a atteint un niveau critique de ${fillLevel}%. Une intervention rapide est requise.`;
    return this.sendSMS(to, body);
  }
};

module.exports = smsService;
