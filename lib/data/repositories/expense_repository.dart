import 'package:uuid/uuid.dart';
import '../models/expense.dart';
import '../services/database_service.dart';
import '../services/currency_service.dart';

/// Repository for expense tracking + budget calculations.
class ExpenseRepository {
  final DatabaseService _db;
  final CurrencyService _currency;
  final _uuid = const Uuid();

  ExpenseRepository({DatabaseService? db, CurrencyService? currency})
      : _db = db ?? DatabaseService.instance,
        _currency = currency ?? CurrencyService();

  Future<Expense> create({
    required String tripId,
    required double amount,
    String currency = 'USD',
    required String category,
    String? description,
    DateTime? date,
    String? location,
    PaymentMethod paymentMethod = PaymentMethod.cash,
    String? notes,
    String? baseCurrency, // trip's base currency for conversion
  }) async {
    double? converted;
    String? convertedCur;
    if (baseCurrency != null && baseCurrency != currency) {
      converted = await _currency.convert(amount, currency, baseCurrency);
      convertedCur = baseCurrency;
    }

    final expense = Expense(
      id: _uuid.v4(),
      tripId: tripId,
      amount: amount,
      currency: currency,
      category: category,
      description: description,
      date: date ?? DateTime.now(),
      location: location,
      paymentMethod: paymentMethod,
      notes: notes,
      createdAt: DateTime.now(),
      convertedAmount: converted,
      convertedCurrency: convertedCur,
    );
    await _db.saveExpense(expense);
    return expense;
  }

  Future<List<Expense>> forTrip(String tripId) => _db.getExpensesForTrip(tripId);

  Future<void> delete(String id) => _db.deleteExpense(id);

  Future<BudgetSummary> summary(String tripId, double budget, String currency) async {
    final expenses = await forTrip(tripId);
    double spent = 0;
    final byCategory = <String, double>{};
    for (final e in expenses) {
      final amt = e.convertedAmount ?? e.amount; // use converted if available
      spent += amt;
      byCategory[e.category] = (byCategory[e.category] ?? 0) + amt;
    }
    return BudgetSummary(
      tripId: tripId,
      totalBudget: budget,
      totalSpent: spent,
      currency: currency,
      categorySpending: byCategory,
    );
  }

  Future<Map<DateTime, double>> spendingTrend(String tripId) async {
    final expenses = await forTrip(tripId);
    final trend = <DateTime, double>{};
    for (final e in expenses) {
      final day = DateTime(e.date.year, e.date.month, e.date.day);
      trend[day] = (trend[day] ?? 0) + (e.convertedAmount ?? e.amount);
    }
    return trend;
  }

  Future<double> dailyAverage(String tripId) async {
    final expenses = await forTrip(tripId);
    if (expenses.isEmpty) return 0;
    final days = expenses.map((e) => '${e.date.year}-${e.date.month}-${e.date.day}').toSet().length;
    return expenses.fold<double>(0, (s, e) => s + (e.convertedAmount ?? e.amount)) / (days == 0 ? 1 : days);
  }
}
