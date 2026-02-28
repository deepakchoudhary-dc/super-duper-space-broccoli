import 'dart:math';
import '../models/trip.dart';
import '../../core/utils/distance_utils.dart';
import '../../core/config/app_config.dart';

/// TSP route optimiser – Nearest Neighbor + 2‑Opt + Simulated Annealing.
class RouteOptimizerService {
  final _rng = Random();

  // ── Public API ────────────────────────────────────────────────────────

  /// Optimise the visit order of [activities] to minimise total travel distance.
  List<Activity> optimize(List<Activity> activities) {
    if (activities.length <= 2) return List.of(activities);

    final dist = _distMatrix(activities);
    // 1. Nearest‑neighbor seed
    var route = _nearestNeighbor(dist);
    // 2. 2‑opt local improvement
    route = _twoOpt(route, dist);
    // 3. Simulated annealing global improvement
    route = _simulatedAnnealing(route, dist);

    return [for (final i in route) activities[i]];
  }

  /// Optimise with time‑window constraints (fixed‑time activities honoured).
  List<Activity> optimizeWithConstraints({
    required List<Activity> activities,
    required DateTime dayStart,
    int maxMinutes = 720,
  }) {
    final fixed = activities.where((a) => a.startTime != null).toList()
      ..sort((a, b) => a.startTime!.compareTo(b.startTime!));
    final flex = activities.where((a) => a.startTime == null).toList();
    final optimisedFlex = optimize(flex);

    final result = <Activity>[];
    int fi = 0, fxi = 0;
    var clock = dayStart;
    while ((fi < fixed.length || fxi < optimisedFlex.length) &&
        clock.difference(dayStart).inMinutes < maxMinutes) {
      if (fi < fixed.length &&
          fixed[fi].startTime!.isBefore(clock.add(const Duration(hours: 1)))) {
        result.add(fixed[fi]);
        clock = fixed[fi].endTime ?? fixed[fi].startTime!.add(const Duration(hours: 1));
        fi++;
      } else if (fxi < optimisedFlex.length) {
        result.add(optimisedFlex[fxi++]);
        clock = clock.add(const Duration(hours: 1, minutes: 15));
      } else {
        break;
      }
    }
    return result;
  }

  double totalDistance(List<Activity> route) {
    if (route.length < 2) return 0;
    double d = 0;
    for (int i = 0; i < route.length - 1; i++) {
      d += DistanceUtils.haversine(
          route[i].latitude, route[i].longitude,
          route[i + 1].latitude, route[i + 1].longitude);
    }
    return d;
  }

  // ── Algorithms ────────────────────────────────────────────────────────

  List<List<double>> _distMatrix(List<Activity> a) {
    final n = a.length;
    return List.generate(n, (i) => List.generate(n, (j) => i == j
        ? 0.0
        : DistanceUtils.haversine(
            a[i].latitude, a[i].longitude, a[j].latitude, a[j].longitude)));
  }

  List<int> _nearestNeighbor(List<List<double>> d) {
    final n = d.length;
    final visited = List.filled(n, false);
    final route = <int>[0];
    visited[0] = true;
    for (int s = 1; s < n; s++) {
      int cur = route.last;
      int best = -1;
      double bestD = double.infinity;
      for (int j = 0; j < n; j++) {
        if (!visited[j] && d[cur][j] < bestD) {
          bestD = d[cur][j];
          best = j;
        }
      }
      if (best != -1) { route.add(best); visited[best] = true; }
    }
    return route;
  }

  List<int> _twoOpt(List<int> route, List<List<double>> d) {
    var r = List<int>.of(route);
    bool improved = true;
    while (improved) {
      improved = false;
      for (int i = 0; i < r.length - 1; i++) {
        for (int j = i + 2; j < r.length; j++) {
          final delta = _twoOptGain(r, i, j, d);
          if (delta < -1e-6) {
            r = [...r.sublist(0, i + 1), ...r.sublist(i + 1, j + 1).reversed, ...r.sublist(j + 1)];
            improved = true;
          }
        }
      }
    }
    return r;
  }

  double _twoOptGain(List<int> r, int i, int j, List<List<double>> d) {
    final a = r[i], b = r[i + 1], c = r[j], e = j + 1 < r.length ? r[j + 1] : r[0];
    return (d[a][c] + d[b][e]) - (d[a][b] + d[c][e]);
  }

  /// Simulated Annealing for global optimisation beyond local 2‑opt.
  List<int> _simulatedAnnealing(List<int> route, List<List<double>> d) {
    var best = List<int>.of(route);
    var bestCost = _routeCost(best, d);
    var current = List<int>.of(best);
    var currentCost = bestCost;
    double temp = AppConfig.saInitialTemp;

    for (int iter = 0; iter < AppConfig.saMaxIterations; iter++) {
      // Random swap of two cities
      final i = 1 + _rng.nextInt(current.length - 1);
      final j = 1 + _rng.nextInt(current.length - 1);
      if (i == j) continue;

      final candidate = List<int>.of(current);
      final tmp = candidate[i];
      candidate[i] = candidate[j];
      candidate[j] = tmp;
      final candidateCost = _routeCost(candidate, d);
      final delta = candidateCost - currentCost;

      if (delta < 0 || _rng.nextDouble() < exp(-delta / temp)) {
        current = candidate;
        currentCost = candidateCost;
      }
      if (currentCost < bestCost) {
        best = List<int>.of(current);
        bestCost = currentCost;
      }
      temp *= AppConfig.saCoolingRate;
    }
    return best;
  }

  double _routeCost(List<int> r, List<List<double>> d) {
    double c = 0;
    for (int i = 0; i < r.length - 1; i++) {
      c += d[r[i]][r[i + 1]];
    }
    return c;
  }
}
