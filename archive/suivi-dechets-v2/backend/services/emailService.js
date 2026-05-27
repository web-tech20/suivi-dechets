const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'your_email@gmail.com',
    pass: process.env.SMTP_PASS || 'your_app_password'
  }
});

const isConfigured = process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_USER !== 'your_email@gmail.com';

const emailService = {
  async sendEmail({ to, subject, html, attachments = [] }) {
    if (!isConfigured) {
      console.log(`
      📬 [EMAIL LOCAL SIMULATION]
      ➡️ To: ${to}
      ➡️ Subject: ${subject}
      ➡️ HTML Content: ${html.substring(0, 300)}...
      ➡️ Attachments Count: ${attachments.length}
      `);
      return { simulated: true, messageId: 'simulated_id_' + Math.random() };
    }

    try {
      const info = await transporter.sendMail({
        from: `"Suivi-Déchets V2.0" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
        attachments
      });
      console.log(`✉️ Email successfully sent to ${to}: ${info.messageId}`);
      return info;
    } catch (err) {
      console.error('⚠️ Nodemailer failed to send email:', err.message);
      throw err;
    }
  },

  async sendVerificationEmail(email, token, name) {
    const link = `http://localhost:3000/api/auth/verify-email/${token}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #10b981;">Bienvenue sur SUIVI-DÉCHETS V2.0, ${name} !</h2>
        <p>Merci pour votre inscription. Veuillez cliquer sur le bouton ci-dessous pour vérifier votre adresse email et activer votre compte :</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${link}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Activer mon compte</a>
        </div>
        <p style="color: #64748b; font-size: 12px;">Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur : <br>${link}</p>
      </div>
    `;
    return this.sendEmail({ to: email, subject: 'Vérification de votre compte Suivi-Déchets V2.0', html });
  },

  async sendPasswordResetEmail(email, token, name) {
    const link = `http://localhost:3000/reset-password.html?token=${token}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #ef4444;">Réinitialisation de votre mot de passe</h2>
        <p>Bonjour ${name},</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe. Veuillez cliquer sur le lien ci-dessous pour en configurer un nouveau (valable 1 heure) :</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${link}" style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Réinitialiser le mot de passe</a>
        </div>
        <p style="color: #64748b; font-size: 12px;">Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email en toute sécurité.</p>
      </div>
    `;
    return this.sendEmail({ to: email, subject: 'Réinitialisation du mot de passe - Suivi-Déchets V2.0', html });
  },

  async sendTourneeReport(email, tourneeData, pdfBuffer) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #10b981;">📋 Fiche de Tournée Disponible - ${tourneeData.nom}</h2>
        <p>Une nouvelle tournée de collecte a été assignée et optimisée.</p>
        <ul>
          <li><strong>Distance :</strong> ${tourneeData.distance_totale} km</li>
          <li><strong>Durée :</strong> ${tourneeData.duree_estimee} minutes</li>
          <li><strong>Économie de CO₂ :</strong> ${tourneeData.co2_economise} kg</li>
        </ul>
        <p>Le document PDF d'impression officiel est joint à cet email.</p>
      </div>
    `;
    return this.sendEmail({
      to: email,
      subject: `📋 Tournée Optimisée - ${tourneeData.nom}`,
      html,
      attachments: [{
        filename: `Tournee_${tourneeData.nom}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
    });
  }
};

module.exports = emailService;
