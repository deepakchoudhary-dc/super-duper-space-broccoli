import 'package:uuid/uuid.dart';
import '../models/trip.dart';
import '../services/database_service.dart';
import '../services/ai_service.dart';
import '../services/places_service.dart';
import '../services/weather_service.dart';
import '../services/route_optimizer_service.dart';
import '../../core/config/app_config.dart';

/// Repository orchestrating trip CRUD + AI itinerary generation + route optimisation.
class TripRepository {
  final DatabaseService _db;
  final AiService _ai;
  final PlacesService _places;
  final WeatherService _weather;
  final RouteOptimizerService _route;
  final _uuid = const Uuid();

  TripRepository({
    DatabaseService? db,
    AiService? ai,
    PlacesService? places,
    WeatherService? weather,
    RouteOptimizerService? route,
  })  : _db = db ?? DatabaseService.instance,
        _ai = ai ?? AiService(),
        _places = places ?? PlacesService(),
        _weather = weather ?? WeatherService(),
        _route = route ?? RouteOptimizerService();

  // ── CRUD ──────────────────────────────────────────────────────────────

  Future<Trip> create({
    required String name,
    required String destination,
    required DateTime startDate,
    required DateTime endDate,
    required double budget,
    String currency = 'USD',
    String? description,
    List<String> tags = const [],
    TripPreferences? preferences,
  }) async {
    final now = DateTime.now();
    final trip = Trip(
      id: _uuid.v4(),
      name: name,
      destination: destination,
      startDate: startDate,
      endDate: endDate,
      budget: budget,
      currency: currency,
      description: description,
      tags: tags,
      preferences: preferences,
      createdAt: now,
      updatedAt: now,
    );
    await _db.saveTrip(trip);
    return trip;
  }

  Future<List<Trip>> getAll() => _db.getAllTrips();
  Future<Trip?> get(String id) => _db.getTrip(id);

  Future<void> update(Trip trip) =>
      _db.saveTrip(trip.copyWith(updatedAt: DateTime.now()));

  Future<void> delete(String id) => _db.deleteTrip(id);

  // ── AI Itinerary Generation ───────────────────────────────────────────

  Future<Trip> generateItinerary(Trip trip) async {
    // 1. Get AI text plan
    final aiText = await _ai.generateItinerary(
      destination: trip.destination,
      days: trip.durationDays,
      interests: trip.preferences?.interests.join(', '),
      budget: trip.preferences?.travelStyle,
      travelStyle: trip.preferences?.travelPace,
    );

    // 2. Get real places near destination
    final places = await _places.searchByText(trip.destination);
    final destLat = places.isNotEmpty ? places.first.latitude : 0.0;
    final destLng = places.isNotEmpty ? places.first.longitude : 0.0;

    // 3. Get weather forecast
    final forecasts = await _weather.forecast(lat: destLat, lng: destLng, days: trip.durationDays);

    // 4. Build day plans with real nearby places + route optimisation
    final dayPlans = <DayPlan>[];
    for (int d = 0; d < trip.durationDays; d++) {
      final date = trip.startDate.add(Duration(days: d));
      final weather = d < forecasts.length ? forecasts[d] : null;

      // Find varied activities
      final dayActivities = await _buildDayActivities(
        lat: destLat, lng: destLng, day: d,
        isRainy: weather != null && !weather.isGoodForOutdoor,
      );

      // Optimise route
      final optimised = _route.optimize(dayActivities);

      dayPlans.add(DayPlan(
        dayNumber: d + 1,
        date: date,
        activities: optimised,
        weather: weather,
        notes: d == 0 ? 'AI-generated based on: $aiText'.substring(0, (aiText.length).clamp(0, 200)) : null,
      ));
    }

    final updated = trip.copyWith(dayPlans: dayPlans, updatedAt: DateTime.now());
    await _db.saveTrip(updated);
    return updated;
  }

  Future<List<Activity>> _buildDayActivities({
    required double lat,
    required double lng,
    required int day,
    bool isRainy = false,
  }) async {
    final types = isRainy
        ? ['museum', 'shopping_mall', 'restaurant', 'cafe']
        : ['tourist_attraction', 'restaurant', 'park', 'museum'];

    final activities = <Activity>[];
    for (final type in types) {
      final nearby = await _places.searchNearby(
        lat: lat + (day * 0.005), // slight offset per day for variety
        lng: lng + (day * 0.003),
        type: type,
        radius: 8000,
      );
      for (final place in nearby.take(2)) {
        activities.add(Activity(
          id: _uuid.v4(),
          name: place.name,
          description: place.description,
          latitude: place.latitude,
          longitude: place.longitude,
          address: place.address,
          type: _typeFromString(type),
          placeId: place.id,
          rating: place.rating,
        ));
      }
    }
    return activities.take(AppConfig.maxActivitiesPerDay ~/ 2).toList();
  }

  ActivityType _typeFromString(String t) {
    switch (t) {
      case 'restaurant': case 'cafe': return ActivityType.restaurant;
      case 'museum': return ActivityType.museum;
      case 'park': case 'tourist_attraction': return ActivityType.attraction;
      case 'shopping_mall': return ActivityType.shopping;
      default: return ActivityType.other;
    }
  }

  // ── Activity management ───────────────────────────────────────────────

  Future<Trip> addActivity(Trip trip, int dayNum, Activity activity) async {
    final plans = List<DayPlan>.of(trip.dayPlans);
    if (dayNum < 1 || dayNum > plans.length) throw ArgumentError('Invalid day');
    final i = dayNum - 1;
    final acts = [...plans[i].activities, activity];
    plans[i] = plans[i].copyWith(activities: _route.optimize(acts));
    final updated = trip.copyWith(dayPlans: plans);
    await update(updated);
    return updated;
  }

  Future<Trip> removeActivity(Trip trip, int dayNum, String actId) async {
    final plans = List<DayPlan>.of(trip.dayPlans);
    if (dayNum < 1 || dayNum > plans.length) throw ArgumentError('Invalid day');
    final i = dayNum - 1;
    plans[i] = plans[i].copyWith(
      activities: plans[i].activities.where((a) => a.id != actId).toList(),
    );
    final updated = trip.copyWith(dayPlans: plans);
    await update(updated);
    return updated;
  }
}

