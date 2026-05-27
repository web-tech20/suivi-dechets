require('dotenv').config();

const apiKey = process.env.GOOGLE_MAPS_API_KEY;

// Haversine fallback distance calculations
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const googleMaps = {
  /**
   * Calculates driving distance and duration between two points
   * ACCOUNTING FOR TRAFFIC.
   */
  async getDistanceAndDuration(originLat, originLng, destLat, destLng) {
    if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
      // Graceful fallback to Haversine routing calculation
      const dist = haversineDistance(originLat, originLng, destLat, destLng);
      const avgSpeed = 25; // 25 km/h in dense city traffic
      const durationMin = Math.round((dist / avgSpeed) * 60);
      
      return {
        distanceKm: Math.round(dist * 100) / 100,
        durationMinutes: durationMin,
        isFallback: true
      };
    }

    try {
      // Call legacy or modern Distance Matrix API (HTTP fetch)
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&mode=driving&departure_time=now&traffic_model=best_guess&key=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.rows[0].elements[0].status === 'OK') {
        const element = data.rows[0].elements[0];
        
        // Use duration_in_traffic if available, otherwise standard duration
        const durationSec = element.duration_in_traffic ? element.duration_in_traffic.value : element.duration.value;
        const distanceMeter = element.distance.value;

        return {
          distanceKm: Math.round((distanceMeter / 1000) * 100) / 100,
          durationMinutes: Math.round(durationSec / 60),
          isFallback: false
        };
      }
      throw new Error(data.error_message || 'Format de réponse invalide');
    } catch (err) {
      console.warn('⚠️ Google Maps routing failed. Falling back to Haversine.', err.message);
      // Fallback
      const dist = haversineDistance(originLat, originLng, destLat, destLng);
      return {
        distanceKm: Math.round(dist * 100) / 100,
        durationMinutes: Math.round((dist / 25) * 60),
        isFallback: true
      };
    }
  }
};

module.exports = googleMaps;
