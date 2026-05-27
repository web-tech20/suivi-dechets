const puppeteer = require('puppeteer');

const pdfGenerator = {
  async generateTourneePDF(tourneeData) {
    let browser = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();

      const today = new Date().toLocaleDateString('fr-FR', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      const html = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8">
          <title>Rapport de Tournée - ${tourneeData.nom}</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 0; background: #fff; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #10b981; padding-bottom: 15px; margin-bottom: 20px; }
            .logo-section h1 { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; letter-spacing: 0.5px; }
            .logo-section span { color: #10b981; }
            .logo-section p { font-size: 11px; color: #64748b; margin: 3px 0 0 0; }
            .meta-section { text-align: right; }
            .meta-section h2 { font-size: 14px; color: #475569; margin: 0; }
            .meta-section p { font-size: 11px; color: #94a3b8; margin: 4px 0 0 0; }
            
            .dashboard { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px; }
            .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
            .kpi-card__label { font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase; }
            .kpi-card__val { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 4px; }
            
            .content-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 20px; }
            
            .table-card h3 { font-size: 14px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin: 0 0 10px 0; }
            .route-table { width: 100%; border-collapse: collapse; text-align: left; }
            .route-table th { background: #f1f5f9; font-size: 11px; color: #475569; font-weight: 700; padding: 8px 10px; border-bottom: 1px solid #cbd5e1; }
            .route-table td { padding: 8px 10px; font-size: 11px; border-bottom: 1px solid #e2e8f0; }
            .route-table tr:last-child td { border-bottom: none; }
            
            .map-card { background: #0f172a; border-radius: 8px; height: 260px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; text-align: center; padding: 20px; box-sizing: border-box; }
            .map-card p { font-size: 12px; color: #94a3b8; margin: 8px 0 0 0; }
            
            .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; }
            .qr-section { display: flex; align-items: center; gap: 10px; }
            .qr-placeholder { width: 60px; height: 60px; border: 2px dashed #cbd5e1; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #94a3b8; }
            .qr-section p { font-size: 10px; color: #64748b; margin: 0; line-height: 1.4; }
            .sig-section { display: flex; gap: 30px; }
            .sig-box { width: 150px; text-align: center; }
            .sig-line { border-bottom: 1px solid #94a3b8; height: 40px; margin-bottom: 5px; }
            .sig-box p { font-size: 10px; color: #64748b; margin: 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo-section">
              <h1>SUIVI-<span>DÉCHETS</span> V2.0</h1>
              <p>Gestion Intelligente & Optimisée des Déchets Urbains</p>
            </div>
            <div class="meta-section">
              <h2>Fiche de Collecte Planifiée</h2>
              <p>Généré le ${today}</p>
            </div>
          </div>

          <div class="dashboard">
            <div class="kpi-card">
              <div class="kpi-card__label">Distance Totale</div>
              <div class="kpi-card__val">${tourneeData.distance_totale} km</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-card__label">Durée Estimée</div>
              <div class="kpi-card__val">${tourneeData.duree_estimee} min</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-card__label">Carburant Estime</div>
              <div class="kpi-card__val">${tourneeData.carburant_estime} L</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-card__label">CO₂ Économisé</div>
              <div class="kpi-card__val">${tourneeData.co2_economise} kg</div>
            </div>
          </div>

          <div class="content-grid">
            <div class="table-card">
              <h3>Séquence des Points de Collecte</h3>
              <table class="route-table">
                <thead>
                  <tr>
                    <th style="width: 40px;">Ordre</th>
                    <th>Nom Poubelle</th>
                    <th>Quartier</th>
                    <th>Adresse</th>
                    <th>Niveau Remplissage</th>
                  </tr>
                </thead>
                <tbody>
                  ${tourneeData.points.map((pt, idx) => `
                    <tr>
                      <td style="font-weight: 700; color: #10b981;">${idx + 1}</td>
                      <td><strong>${pt.nom}</strong></td>
                      <td>${pt.quartier}</td>
                      <td>${pt.adresse || '--'}</td>
                      <td>
                        <span style="color: ${pt.niveau >= 80 ? '#ef4444' : pt.niveau >= 50 ? '#f59e0b' : '#10b981'}; font-weight: 700;">
                          ${pt.niveau !== undefined ? pt.niveau + '%' : 'Dépôt Central'}
                        </span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div>
              <div class="map-card">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/></svg>
                <div style="font-weight: 700; margin-top: 10px; font-size: 14px;">Tracé de la Route Google Maps</div>
                <p>Abomey-Calavi — Secteur principal. Chauffeur: ${tourneeData.collecteur_nom || 'Équipe de collecte 1'}</p>
                <div style="font-size: 10px; color: #64748b; margin-top: 15px;">Itinéraire calculé avec prise en compte du trafic en temps réel.</div>
              </div>
            </div>
          </div>

          <div class="footer">
            <div class="qr-section">
              <div class="qr-placeholder">QR SCAN</div>
              <div>
                <p><strong>SCAN DE VALIDATION</strong></p>
                <p>Scanner ce code sur l'application mobile<br>pour attester de la fin de tournée.</p>
              </div>
            </div>
            <div class="sig-section">
              <div class="sig-box">
                <div class="sig-line"></div>
                <p>Signature Chauffeur</p>
              </div>
              <div class="sig-box">
                <div class="sig-line"></div>
                <p>Signature Superviseur</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      await page.setContent(html);
      
      const pdf = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true
      });

      return pdf;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
};

module.exports = pdfGenerator;
