// Expense tracking models — hand-written serialisation.

enum PaymentMethod { cash, card, digitalWallet, bankTransfer, crypto, other }

class Expense {
  final String id;
  final String tripId;
  final double amount;
  final String currency;
  final String category;
  final String? description;
  final DateTime date;
  final String? location;
  final String? receiptImageUrl;
  final String? notes;
  final PaymentMethod paymentMethod;
  final DateTime createdAt;
  final bool isSynced;
  final double? convertedAmount; // amount in trip's base currency
  final String? convertedCurrency;

  const Expense({
    required this.id,
    required this.tripId,
    required this.amount,
    this.currency = 'USD',
    required this.category,
    this.description,
    required this.date,
    this.location,
    this.receiptImageUrl,
    this.notes,
    this.paymentMethod = PaymentMethod.cash,
    required this.createdAt,
    this.isSynced = false,
    this.convertedAmount,
    this.convertedCurrency,
  });

  Expense copyWith({
    String? id,
    String? tripId,
    double? amount,
    String? currency,
    String? category,
    String? description,
    DateTime? date,
    String? location,
    String? receiptImageUrl,
    String? notes,
    PaymentMethod? paymentMethod,
    DateTime? createdAt,
    bool? isSynced,
    double? convertedAmount,
    String? convertedCurrency,
  }) =>
      Expense(
        id: id ?? this.id,
        tripId: tripId ?? this.tripId,
        amount: amount ?? this.amount,
        currency: currency ?? this.currency,
        category: category ?? this.category,
        description: description ?? this.description,
        date: date ?? this.date,
        location: location ?? this.location,
        receiptImageUrl: receiptImageUrl ?? this.receiptImageUrl,
        notes: notes ?? this.notes,
        paymentMethod: paymentMethod ?? this.paymentMethod,
        createdAt: createdAt ?? this.createdAt,
        isSynced: isSynced ?? this.isSynced,
        convertedAmount: convertedAmount ?? this.convertedAmount,
        convertedCurrency: convertedCurrency ?? this.convertedCurrency,
      );

  factory Expense.fromJson(Map<String, dynamic> j) => Expense(
        id: j['id'] as String,
        tripId: j['tripId'] as String,
        amount: (j['amount'] as num).toDouble(),
        currency: j['currency'] as String? ?? 'USD',
        category: j['category'] as String,
        description: j['description'] as String?,
        date: DateTime.parse(j['date'] as String),
        location: j['location'] as String?,
        receiptImageUrl: j['receiptImageUrl'] as String?,
        notes: j['notes'] as String?,
        paymentMethod: PaymentMethod.values.firstWhere(
          (e) => e.name == j['paymentMethod'],
          orElse: () => PaymentMethod.cash,
        ),
        createdAt: DateTime.parse(j['createdAt'] as String),
        isSynced: j['isSynced'] as bool? ?? false,
        convertedAmount: (j['convertedAmount'] as num?)?.toDouble(),
        convertedCurrency: j['convertedCurrency'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'tripId': tripId,
        'amount': amount,
        'currency': currency,
        'category': category,
        'description': description,
        'date': date.toIso8601String(),
        'location': location,
        'receiptImageUrl': receiptImageUrl,
        'notes': notes,
        'paymentMethod': paymentMethod.name,
        'createdAt': createdAt.toIso8601String(),
        'isSynced': isSynced,
        'convertedAmount': convertedAmount,
        'convertedCurrency': convertedCurrency,
      };
}

class BudgetSummary {
  final String tripId;
  final double totalBudget;
  final double totalSpent;
  final String currency;
  final Map<String, double> categorySpending;

  BudgetSummary({
    required this.tripId,
    required this.totalBudget,
    required this.totalSpent,
    required this.currency,
    required this.categorySpending,
  });

  double get remaining => totalBudget - totalSpent;
  double get percentUsed =>
      totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  bool get isOverBudget => remaining < 0;
  bool get isNearLimit => percentUsed > 80;
  double get dailyAverage => totalSpent; // caller divides by days
}
