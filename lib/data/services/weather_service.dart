import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../core/config/app_config.dart';
import '../models/trip.dart';

/// OpenWeather API integration.
class WeatherService {
  final http.Client _client;
  final Map<String, List<WeatherInfo>> _cache = {};

  WeatherService({http.Client? client}) : _client = client ?? http.Client();

  Future<WeatherInfo> current({
    required double lat,
    required double lng,
  }) async {
    if (AppConfig.openWeatherApiKey.isEmpty) return _demo();
    final uri = Uri.parse('${AppConfig.openWeatherBaseUrl}/weather').replace(
      queryParameters: {
        'lat': '$lat', 'lon': '$lng',
        'appid': AppConfig.openWeatherApiKey, 'units': 'metric',
      },
    );
    final res = await _client.get(uri);
    if (res.statusCode == 200) return _parse(jsonDecode(res.body));
    return _demo();
  }

  Future<List<WeatherInfo>> forecast({
    required double lat,
    required double lng,
    int days = 5,
  }) async {
    final key = '${lat.toStringAsFixed(2)},${lng.toStringAsFixed(2)}';
    if (_cache.containsKey(key)) return _cache[key]!;

    if (AppConfig.openWeatherApiKey.isEmpty) return _demoForecast(days);
    final uri = Uri.parse('${AppConfig.openWeatherBaseUrl}/forecast').replace(
      queryParameters: {
        'lat': '$lat', 'lon': '$lng',
        'appid': AppConfig.openWeatherApiKey, 'units': 'metric',
        'cnt': '${days * 8}',
      },
    );
    try {
      final res = await _client.get(uri);
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final byDay = <String, WeatherInfo>{};
        for (final item in data['list'] as List) {
          final w = _parse(item as Map<String, dynamic>);
          final dayKey = '${w.date.year}-${w.date.month}-${w.date.day}';
          if (!byDay.containsKey(dayKey) || (w.date.hour - 12).abs() < (byDay[dayKey]!.date.hour - 12).abs()) {
            byDay[dayKey] = w;
          }
        }
        final result = byDay.values.toList()..sort((a, b) => a.date.compareTo(b.date));
        _cache[key] = result;
        return result;
      }
    } catch (_) {}
    return _demoForecast(days);
  }

  bool isGoodForOutdoor(WeatherInfo w) => w.isGoodForOutdoor;

  String iconUrl(String icon) => 'https://openweathermap.org/img/wn/$icon@2x.png';

  WeatherInfo _parse(Map<String, dynamic> d) {
    final main = d['main'] as Map<String, dynamic>;
    final w = (d['weather'] as List).first as Map<String, dynamic>;
    final wind = d['wind'] as Map<String, dynamic>;
    return WeatherInfo(
      date: DateTime.fromMillisecondsSinceEpoch((d['dt'] as int) * 1000),
      temperature: (main['temp'] as num).toDouble(),
      feelsLike: (main['feels_like'] as num).toDouble(),
      condition: w['main'] as String,
      description: w['description'] as String,
      humidity: main['humidity'] as int,
      windSpeed: (wind['speed'] as num).toDouble(),
      icon: w['icon'] as String,
    );
  }

  WeatherInfo _demo() => WeatherInfo(
        date: DateTime.now(),
        temperature: 22,
        feelsLike: 21,
        condition: 'Clear',
        description: 'clear sky',
        humidity: 55,
        windSpeed: 3.5,
        icon: '01d',
      );

  List<WeatherInfo> _demoForecast(int days) => List.generate(
        days,
        (i) => WeatherInfo(
          date: DateTime.now().add(Duration(days: i)),
          temperature: 20 + (i % 3) * 2.0,
          feelsLike: 19 + (i % 3) * 2.0,
          condition: i % 4 == 3 ? 'Rain' : 'Clear',
          description: i % 4 == 3 ? 'light rain' : 'clear sky',
          humidity: 50 + i * 3,
          windSpeed: 2 + i * 0.5,
          icon: i % 4 == 3 ? '10d' : '01d',
        ),
      );

  void dispose() => _client.close();
}
