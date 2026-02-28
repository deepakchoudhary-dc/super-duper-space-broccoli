/// Central configuration for the Travel Companion app.
/// API keys are loaded from environment variables at compile time.
class AppConfig {
  AppConfig._();

  // ── API Keys ──────────────────────────────────────────────────────────
  static const String googleMapsApiKey =
      String.fromEnvironment('GOOGLE_MAPS_API_KEY');
  static const String openaiApiKey =
      String.fromEnvironment('OPENAI_API_KEY');
  static const String openWeatherApiKey =
      String.fromEnvironment('OPENWEATHER_API_KEY');
  static const String currencyApiKey =
      String.fromEnvironment('CURRENCY_API_KEY');

  // ── Endpoints ─────────────────────────────────────────────────────────
  static const String openaiBaseUrl = 'https://api.openai.com/v1';
  static const String openWeatherBaseUrl =
      'https://api.openweathermap.org/data/2.5';
  static const String googlePlacesBaseUrl =
      'https://maps.googleapis.com/maps/api/place';
  static const String currencyApiBaseUrl =
      'https://api.exchangerate-api.com/v4/latest';
  static const String osrmBaseUrl =
      'https://router.project-osrm.org'; // free OSRM demo

  // ── App Meta ──────────────────────────────────────────────────────────
  static const String appName = 'Travel Companion';
  static const String appVersion = '1.0.0';

  // ── Database ──────────────────────────────────────────────────────────
  static const String dbName = 'travel_companion.db';
  static const int dbVersion = 1;

  // ── AI ────────────────────────────────────────────────────────────────
  static const String aiModel = 'gpt-4o';
  static const int aiMaxTokens = 4096;
  static const double aiTemperature = 0.7;

  // ── Route Optimisation ────────────────────────────────────────────────
  static const int maxActivitiesPerDay = 12;
  static const double walkingSpeedKmh = 5.0;
  static const double drivingSpeedKmh = 40.0;
  static const int saMaxIterations = 10000; // simulated annealing
  static const double saInitialTemp = 10000.0;
  static const double saCoolingRate = 0.9995;

  // ── Budget ────────────────────────────────────────────────────────────
  static const List<String> expenseCategories = [
    'Accommodation',
    'Food & Dining',
    'Transportation',
    'Activities & Tours',
    'Shopping',
    'Health & Medical',
    'Communication',
    'Emergency',
    'Other',
  ];

  // ── Emergency ─────────────────────────────────────────────────────────
  static const Map<String, String> globalEmergencyNumbers = {
    'Police (International)': '112',
    'Ambulance (International)': '112',
    'US Emergency': '911',
    'UK Emergency': '999',
    'Japan Emergency': '110',
    'Australia Emergency': '000',
    'India Emergency': '112',
  };
}
