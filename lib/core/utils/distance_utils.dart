import 'dart:math';

/// Haversine distance + helpers, using *real* dart:math.
class DistanceUtils {
  DistanceUtils._();

  static const double _earthRadiusKm = 6371.0;

  /// Great‑circle distance in **km** between two lat/lng pairs.
  static double haversine(
      double lat1, double lon1, double lat2, double lon2) {
    final dLat = _deg2rad(lat2 - lat1);
    final dLon = _deg2rad(lon2 - lon1);
    final a = sin(dLat / 2) * sin(dLat / 2) +
        cos(_deg2rad(lat1)) * cos(_deg2rad(lat2)) *
        sin(dLon / 2) * sin(dLon / 2);
    return _earthRadiusKm * 2 * atan2(sqrt(a), sqrt(1 - a));
  }

  static double _deg2rad(double d) => d * pi / 180;

  /// Human‑readable distance string.
  static String format(double km) =>
      km < 1 ? '${(km * 1000).round()} m' : '${km.toStringAsFixed(1)} km';

  /// Estimated travel time at given speed (km/h).
  static Duration travelTime(double km, {double speedKmh = 40}) =>
      Duration(minutes: (km / speedKmh * 60).round());
}
