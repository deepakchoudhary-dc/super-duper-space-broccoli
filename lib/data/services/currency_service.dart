import 'dart:convert';
import 'package:http/http.dart' as http;

/// Currency conversion with caching.
class CurrencyService {
  final http.Client _client;
  final Map<String, Map<String, double>> _cache = {};
  DateTime? _lastFetch;
  static const _baseUrl = 'https://api.exchangerate-api.com/v4/latest';

  CurrencyService({http.Client? client}) : _client = client ?? http.Client();

  Future<Map<String, double>> rates(String base) async {
    if (_cache.containsKey(base) &&
        _lastFetch != null &&
        DateTime.now().difference(_lastFetch!).inMinutes < 60) {
      return _cache[base]!;
    }
    try {
      final res = await _client.get(Uri.parse('$_baseUrl/$base'));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        final r = (data['rates'] as Map<String, dynamic>)
            .map((k, v) => MapEntry(k, (v as num).toDouble()));
        _cache[base] = r;
        _lastFetch = DateTime.now();
        return r;
      }
    } catch (_) {}
    // Fallback rates (offline)
    return _cache[base] ?? _fallbackRates;
  }

  Future<double> convert(double amount, String from, String to) async {
    if (from == to) return amount;
    final r = await rates(from);
    return amount * (r[to] ?? 1.0);
  }

  Future<double> rate(String from, String to) async {
    if (from == to) return 1.0;
    final r = await rates(from);
    return r[to] ?? 1.0;
  }

  static const _fallbackRates = <String, double>{
    'USD': 1.0, 'EUR': 0.92, 'GBP': 0.79, 'JPY': 149.5,
    'CNY': 7.24, 'INR': 83.1, 'AUD': 1.53, 'CAD': 1.36,
    'CHF': 0.88, 'KRW': 1320.0, 'THB': 35.5, 'SGD': 1.34,
    'MXN': 17.15, 'BRL': 4.97,
  };

  void dispose() => _client.close();
}
