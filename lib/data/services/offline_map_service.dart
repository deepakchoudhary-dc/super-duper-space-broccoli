import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/place.dart';

/// Handles caching of map places for offline use via SharedPreferences.
class OfflineMapService {
  static const _savedPlacesKey = 'offline_saved_places';

  /// Returns all locally-saved places.
  Future<List<Place>> getSavedPlaces() async {
    final prefs = await SharedPreferences.getInstance();
    final jsonList = prefs.getStringList(_savedPlacesKey) ?? [];
    return jsonList
        .map((s) => Place.fromJson(jsonDecode(s) as Map<String, dynamic>))
        .toList();
  }

  /// Overwrites the saved-places list with [places].
  Future<void> savePlaces(List<Place> places) async {
    final prefs = await SharedPreferences.getInstance();
    final jsonList = places.map((p) => jsonEncode(p.toJson())).toList();
    await prefs.setStringList(_savedPlacesKey, jsonList);
  }

  /// Removes all locally-saved places.
  Future<void> clearSavedPlaces() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_savedPlacesKey);
  }
}
