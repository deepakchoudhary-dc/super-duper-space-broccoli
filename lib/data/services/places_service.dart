import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../core/config/app_config.dart';
import '../models/place.dart';

/// Google Places API wrapper.
class PlacesService {
  final http.Client _client;

  PlacesService({http.Client? client}) : _client = client ?? http.Client();

  Future<List<Place>> searchNearby({
    required double lat,
    required double lng,
    String? type,
    String? keyword,
    int radius = 5000,
  }) async {
    if (AppConfig.googleMapsApiKey.isEmpty) return _demoPlaces(lat, lng);

    final params = {
      'location': '$lat,$lng',
      'radius': '$radius',
      'key': AppConfig.googleMapsApiKey,
      if (type != null) 'type': type,
      if (keyword != null) 'keyword': keyword,
    };
    final uri = Uri.parse('${AppConfig.googlePlacesBaseUrl}/nearbysearch/json')
        .replace(queryParameters: params);
    final res = await _client.get(uri);
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      if (data['status'] == 'OK') {
        return (data['results'] as List)
            .map((j) => Place.fromGoogleJson(j as Map<String, dynamic>))
            .toList();
      }
    }
    return _demoPlaces(lat, lng);
  }

  Future<List<Place>> searchByText(String query) async {
    if (AppConfig.googleMapsApiKey.isEmpty) return _demoPlaces(0, 0);

    final params = {'query': query, 'key': AppConfig.googleMapsApiKey};
    final uri = Uri.parse('${AppConfig.googlePlacesBaseUrl}/textsearch/json')
        .replace(queryParameters: params);
    final res = await _client.get(uri);
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body);
      if (data['status'] == 'OK') {
        return (data['results'] as List)
            .map((j) => Place.fromGoogleJson(j as Map<String, dynamic>))
            .toList();
      }
    }
    return _demoPlaces(0, 0);
  }

  Future<List<String>> autocomplete(String input) async {
    if (AppConfig.googleMapsApiKey.isEmpty || input.length < 2) return [];
    final params = {'input': input, 'key': AppConfig.googleMapsApiKey};
    final uri = Uri.parse('${AppConfig.googlePlacesBaseUrl}/autocomplete/json')
        .replace(queryParameters: params);
    try {
      final res = await _client.get(uri);
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return (data['predictions'] as List?)
                ?.map((p) => p['description'] as String)
                .toList() ??
            [];
      }
    } catch (_) {}
    return [];
  }

  /// Demo/offline fallback places.
  List<Place> _demoPlaces(double lat, double lng) => [
        Place(id: 'demo_1', name: 'Central Park', latitude: lat + 0.01, longitude: lng + 0.01, address: 'City Center', rating: 4.7, types: ['park'], description: 'Beautiful urban park'),
        Place(id: 'demo_2', name: 'Local Museum', latitude: lat - 0.005, longitude: lng + 0.005, address: 'Museum District', rating: 4.5, types: ['museum'], description: 'Art and history museum'),
        Place(id: 'demo_3', name: 'Riverside Café', latitude: lat + 0.003, longitude: lng - 0.008, address: 'Waterfront', rating: 4.3, types: ['restaurant', 'cafe'], description: 'Cozy café with river views'),
        Place(id: 'demo_4', name: 'Night Market', latitude: lat - 0.002, longitude: lng + 0.012, address: 'Old Town', rating: 4.6, types: ['shopping'], description: 'Vibrant night market with local crafts'),
        Place(id: 'demo_5', name: 'Heritage Temple', latitude: lat + 0.008, longitude: lng - 0.003, address: 'Temple Road', rating: 4.8, types: ['tourist_attraction'], description: 'Ancient temple with stunning architecture'),
      ];

  void dispose() => _client.close();
}
