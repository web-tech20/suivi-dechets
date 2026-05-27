const googleMaps = require('./googleMaps');

const optimization = {
  /**
   * Generates optimal routing using driving calculations
   * Starting and ending at depot (index 0)
   */
  async optimizeTSP(points) {
    if (points.length <= 2) {
      return { route: points, distance: 0, duration: 0 };
    }

    const n = points.length;

    // 1. Build real driving distance and duration matrices
    const distMatrix = Array.from({ length: n }, () => new Array(n).fill(0));
    const durationMatrix = Array.from({ length: n }, () => new Array(n).fill(0));

    console.log(`🧭 Building routing matrix for ${n} points (including depot)...`);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const res = await googleMaps.getDistanceAndDuration(
          points[i].latitude, points[i].longitude,
          points[j].latitude, points[j].longitude
        );
        distMatrix[i][j] = res.distanceKm;
        durationMatrix[i][j] = res.durationMinutes;
      }
    }

    // 2. Nearest Neighbor heuristic starting at Depot (index 0)
    const visited = new Array(n).fill(false);
    const route = [0];
    visited[0] = true;
    let current = 0;

    for (let step = 1; step < n; step++) {
      let nearest = -1;
      let minDist = Infinity;
      for (let j = 0; j < n; j++) {
        if (!visited[j] && distMatrix[current][j] < minDist) {
          minDist = distMatrix[current][j];
          nearest = j;
        }
      }
      if (nearest !== -1) {
        visited[nearest] = true;
        route.push(nearest);
        current = nearest;
      }
    }

    // 3. 2-opt improvement algorithm
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 1; i < route.length - 1; i++) {
        for (let j = i + 1; j < route.length; j++) {
          const oldDist = distMatrix[route[i - 1]][route[i]] + distMatrix[route[j]][route[(j + 1) % route.length]];
          const newDist = distMatrix[route[i - 1]][route[j]] + distMatrix[route[i]][route[(j + 1) % route.length]];
          if (newDist < oldDist) {
            const segment = route.slice(i, j + 1).reverse();
            route.splice(i, j - i + 1, ...segment);
            improved = true;
          }
        }
      }
    }

    // 4. Calculate final stats
    let totalDistance = 0;
    let totalDuration = 0;
    for (let i = 0; i < route.length - 1; i++) {
      totalDistance += distMatrix[route[i]][route[i + 1]];
      totalDuration += durationMatrix[route[i]][route[i + 1]];
    }
    // Return path to depot
    totalDistance += distMatrix[route[route.length - 1]][route[0]];
    totalDuration += durationMatrix[route[route.length - 1]][route[0]];

    const orderedPoints = route.map(idx => points[idx]);

    return {
      route: orderedPoints,
      distanceKm: Math.round(totalDistance * 100) / 100,
      durationMinutes: Math.round(totalDuration)
    };
  }
};

module.exports = optimization;
