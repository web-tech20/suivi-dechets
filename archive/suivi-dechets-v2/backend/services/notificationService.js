const Notification = require('../models/Notification');
const emailService = require('./emailService');
const smsService = require('./smsService');

// Assuming firebase-admin would be initialized here if fully configured
// const admin = require('firebase-admin');

const notificationService = {
  async dispatch(userId, type, message, severity = 'info', contactInfo = {}) {
    try {
      // 1. Log the notification in the database
      await Notification.create({
        userId,
        type,
        canal: 'system',
        message,
        statut: 'logged'
      });

      // 2. Dispatch via Email if urgent or specifically requested
      if (severity === 'urgent' && contactInfo.email) {
        await emailService.sendEmail({
          to: contactInfo.email,
          subject: `SUIVI-DÉCHETS ALERTE: ${type}`,
          html: `<p><strong>Alerte Système:</strong></p><p>${message}</p>`
        });
        await Notification.create({ userId, type, canal: 'email', message, statut: 'envoyé' });
      }

      // 3. Dispatch via SMS if critical and phone provided
      if (severity === 'critical' && contactInfo.phone) {
        await smsService.sendSMS(contactInfo.phone, message);
        await Notification.create({ userId, type, canal: 'sms', message, statut: 'envoyé' });
      }

      // 4. Web Push / FCM (Mocked for now, but infrastructure is ready)
      if (severity === 'urgent' || severity === 'critical') {
          console.log(`🔔 [PUSH NOTIFICATION SIMULATION] User: ${userId} | Message: ${message}`);
          await Notification.create({ userId, type, canal: 'push', message, statut: 'simulé' });
      }

    } catch (err) {
      console.error('⚠️ Failed to dispatch notification:', err);
    }
  }
};

module.exports = notificationService;
