import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/models/trip.dart';
import '../../data/models/expense.dart';
import '../../data/models/user_profile.dart';
import '../../data/models/chat_message.dart';
import '../../data/services/ai_service.dart';
import '../../data/services/places_service.dart';
import '../../data/services/weather_service.dart';
import '../../data/services/currency_service.dart';
import '../../data/services/route_optimizer_service.dart';
import '../../data/repositories/trip_repository.dart';
import '../../data/repositories/expense_repository.dart';

// ═══════════════════════════════════════════════════════════════════════
//  SERVICE PROVIDERS (singletons)
// ═══════════════════════════════════════════════════════════════════════

final aiServiceProvider = Provider<AiService>((_) => AiService());
final placesServiceProvider = Provider<PlacesService>((_) => PlacesService());
final weatherServiceProvider = Provider<WeatherService>((_) => WeatherService());
final currencyServiceProvider = Provider<CurrencyService>((_) => CurrencyService());
final routeOptimizerProvider = Provider<RouteOptimizerService>((_) => RouteOptimizerService());

// ═══════════════════════════════════════════════════════════════════════
//  REPOSITORY PROVIDERS
// ═══════════════════════════════════════════════════════════════════════

final tripRepoProvider = Provider<TripRepository>((ref) => TripRepository(
      ai: ref.read(aiServiceProvider),
      places: ref.read(placesServiceProvider),
      weather: ref.read(weatherServiceProvider),
      route: ref.read(routeOptimizerProvider),
    ));

final expenseRepoProvider = Provider<ExpenseRepository>((ref) => ExpenseRepository(
      currency: ref.read(currencyServiceProvider),
    ));

// ═══════════════════════════════════════════════════════════════════════
//  STATE PROVIDERS
// ═══════════════════════════════════════════════════════════════════════

final currentUserProvider = StateProvider<UserProfile?>((_) => null);
final currentTripProvider = StateProvider<Trip?>((_) => null);
final isOfflineProvider = StateProvider<bool>((_) => false);
final bottomNavIndexProvider = StateProvider<int>((_) => 0);

// Theme mode
final darkModeProvider = StateProvider<bool>((_) => false);

// ═══════════════════════════════════════════════════════════════════════
//  TRIPS
// ═══════════════════════════════════════════════════════════════════════

final tripsProvider =
    StateNotifierProvider<TripsNotifier, AsyncValue<List<Trip>>>(
        (ref) => TripsNotifier(ref.read(tripRepoProvider)));

class TripsNotifier extends StateNotifier<AsyncValue<List<Trip>>> {
  final TripRepository _repo;
  TripsNotifier(this._repo) : super(const AsyncValue.loading()) {
    load();
  }

  Future<void> load() async {
    state = const AsyncValue.loading();
    try {
      state = AsyncValue.data(await _repo.getAll());
    } catch (e, s) {
      state = AsyncValue.error(e, s);
    }
  }

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
    final trip = await _repo.create(
        name: name, destination: destination, startDate: startDate,
        endDate: endDate, budget: budget, currency: currency,
        description: description, tags: tags, preferences: preferences);
    await load();
    return trip;
  }

  Future<Trip> generateItinerary(Trip trip) async {
    final updated = await _repo.generateItinerary(trip);
    await load();
    return updated;
  }

  Future<void> delete(String id) async {
    await _repo.delete(id);
    await load();
  }

  Future<void> updateTrip(Trip trip) async {
    await _repo.update(trip);
    await load();
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  EXPENSES
// ═══════════════════════════════════════════════════════════════════════

final expensesProvider = StateNotifierProvider.family<ExpensesNotifier,
    AsyncValue<List<Expense>>, String>(
  (ref, tripId) => ExpensesNotifier(ref.read(expenseRepoProvider), tripId),
);

final budgetSummaryProvider =
    FutureProvider.family<BudgetSummary, String>((ref, tripId) async {
  final trip = ref.watch(currentTripProvider);
  if (trip == null) throw Exception('No trip selected');
  return ref.read(expenseRepoProvider).summary(tripId, trip.budget, trip.currency);
});

class ExpensesNotifier extends StateNotifier<AsyncValue<List<Expense>>> {
  final ExpenseRepository _repo;
  final String _tripId;
  ExpensesNotifier(this._repo, this._tripId) : super(const AsyncValue.loading()) {
    load();
  }

  Future<void> load() async {
    state = const AsyncValue.loading();
    try {
      state = AsyncValue.data(await _repo.forTrip(_tripId));
    } catch (e, s) {
      state = AsyncValue.error(e, s);
    }
  }

  Future<void> add({
    required double amount,
    String currency = 'USD',
    required String category,
    String? description,
    DateTime? date,
    PaymentMethod paymentMethod = PaymentMethod.cash,
    String? baseCurrency,
  }) async {
    await _repo.create(
      tripId: _tripId, amount: amount, currency: currency,
      category: category, description: description, date: date,
      paymentMethod: paymentMethod, baseCurrency: baseCurrency,
    );
    await load();
  }

  Future<void> remove(String id) async {
    await _repo.delete(id);
    await load();
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  CHAT
// ═══════════════════════════════════════════════════════════════════════

final chatProvider =
    StateNotifierProvider<ChatNotifier, List<ChatMessage>>(
        (ref) => ChatNotifier(ref.read(aiServiceProvider)));

class ChatNotifier extends StateNotifier<List<ChatMessage>> {
  final AiService _ai;
  ChatNotifier(this._ai) : super([]);

  Future<void> send(String text, {Trip? trip}) async {
    final userMsg = ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      content: text,
      role: MessageRole.user,
      timestamp: DateTime.now(),
      tripId: trip?.id,
    );
    state = [...state, userMsg];

    // Add loading indicator
    final loadingMsg = ChatMessage(
      id: '${DateTime.now().millisecondsSinceEpoch}_loading',
      content: '',
      role: MessageRole.assistant,
      timestamp: DateTime.now(),
      isLoading: true,
    );
    state = [...state, loadingMsg];

    try {
      final response = await _ai.chat(
        message: text,
        history: state.where((m) => !m.isLoading).toList(),
        currentTrip: trip,
      );
      // Replace loading with real response
      state = [
        ...state.where((m) => !m.isLoading),
        ChatMessage(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          content: response,
          role: MessageRole.assistant,
          timestamp: DateTime.now(),
          tripId: trip?.id,
        ),
      ];
    } catch (e) {
      state = [
        ...state.where((m) => !m.isLoading),
        ChatMessage(
          id: DateTime.now().millisecondsSinceEpoch.toString(),
          content: 'Sorry, I encountered an error. Please try again.',
          role: MessageRole.assistant,
          timestamp: DateTime.now(),
        ),
      ];
    }
  }

  void clear() => state = [];
}
