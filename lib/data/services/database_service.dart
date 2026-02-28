import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/trip.dart';
import '../models/expense.dart';

/// Simple local storage using SharedPreferences (works on web + mobile).
/// In production, replace with sqflite (mobile) or IndexedDB (web).
class DatabaseService {
  static final DatabaseService instance = DatabaseService._();
  DatabaseService._();

  SharedPreferences? _prefs;

  Future<SharedPreferences> get _p async =>
      _prefs ??= await SharedPreferences.getInstance();

  // ── Trips ────────────────────────────────────────────────────────────
  Future<void> saveTrip(Trip trip) async {
    final p = await _p;
    final trips = await getAllTrips();
    final idx = trips.indexWhere((t) => t.id == trip.id);
    if (idx >= 0) {
      trips[idx] = trip;
    } else {
      trips.add(trip);
    }
    await p.setString('trips', jsonEncode(trips.map((t) => t.toJson()).toList()));
  }

  Future<List<Trip>> getAllTrips() async {
    final p = await _p;
    final raw = p.getString('trips');
    if (raw == null) return [];
    final list = jsonDecode(raw) as List;
    return list.map((j) => Trip.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<Trip?> getTrip(String id) async {
    final trips = await getAllTrips();
    try {
      return trips.firstWhere((t) => t.id == id);
    } catch (_) {
      return null;
    }
  }

  Future<void> deleteTrip(String id) async {
    final p = await _p;
    final trips = await getAllTrips();
    trips.removeWhere((t) => t.id == id);
    await p.setString('trips', jsonEncode(trips.map((t) => t.toJson()).toList()));
  }

  // ── Expenses ─────────────────────────────────────────────────────────
  Future<void> saveExpense(Expense expense) async {
    final p = await _p;
    final all = await getAllExpenses();
    final idx = all.indexWhere((e) => e.id == expense.id);
    if (idx >= 0) {
      all[idx] = expense;
    } else {
      all.add(expense);
    }
    await p.setString('expenses', jsonEncode(all.map((e) => e.toJson()).toList()));
  }

  Future<List<Expense>> getAllExpenses() async {
    final p = await _p;
    final raw = p.getString('expenses');
    if (raw == null) return [];
    final list = jsonDecode(raw) as List;
    return list.map((j) => Expense.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<List<Expense>> getExpensesForTrip(String tripId) async {
    final all = await getAllExpenses();
    return all.where((e) => e.tripId == tripId).toList();
  }

  Future<void> deleteExpense(String id) async {
    final p = await _p;
    final all = await getAllExpenses();
    all.removeWhere((e) => e.id == id);
    await p.setString('expenses', jsonEncode(all.map((e) => e.toJson()).toList()));
  }

  // ── Generic cache ────────────────────────────────────────────────────
  Future<void> cacheData(String key, Map<String, dynamic> data) async {
    final p = await _p;
    await p.setString('cache_$key', jsonEncode(data));
  }

  Future<Map<String, dynamic>?> getCachedData(String key) async {
    final p = await _p;
    final raw = p.getString('cache_$key');
    if (raw == null) return null;
    return jsonDecode(raw) as Map<String, dynamic>;
  }

  Future<void> clearAll() async {
    final p = await _p;
    await p.clear();
  }
}
