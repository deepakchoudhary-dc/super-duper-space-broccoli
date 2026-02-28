import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fl_chart/fl_chart.dart';
import '../providers/app_providers.dart';
import '../../data/models/expense.dart';
import '../../core/config/app_config.dart';
import '../../core/utils/currency_utils.dart';
import '../../core/theme/app_theme.dart';

class BudgetScreen extends ConsumerStatefulWidget {
  const BudgetScreen({super.key});
  @override
  ConsumerState<BudgetScreen> createState() => _BudgetScreenState();
}

class _BudgetScreenState extends ConsumerState<BudgetScreen> {
  @override
  Widget build(BuildContext context) {
    final trip = ref.watch(currentTripProvider);
    if (trip == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Budget')),
        body: const Center(child: Text('Select a trip first')),
      );
    }

    final budgetAsync = ref.watch(budgetSummaryProvider(trip.id));
    final expensesAsync = ref.watch(expensesProvider(trip.id));

    return Scaffold(
      appBar: AppBar(title: Text('Budget – ${trip.name}')),
      body: budgetAsync.when(
        data: (summary) => SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Overview Card ──────────────────────────────────────
              _BudgetOverview(summary: summary),
              const SizedBox(height: 20),

              // ── Category Chart ─────────────────────────────────────
              if (summary.categorySpending.isNotEmpty) ...[
                const Text('Spending by Category', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                SizedBox(
                  height: 200,
                  child: PieChart(PieChartData(
                    sections: _buildPieSections(summary),
                    centerSpaceRadius: 40,
                    sectionsSpace: 2,
                  )),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 12,
                  runSpacing: 4,
                  children: summary.categorySpending.entries.map((e) {
                    final color = _catColor(e.key);
                    return Row(mainAxisSize: MainAxisSize.min, children: [
                      Container(width: 12, height: 12, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
                      const SizedBox(width: 4),
                      Text('${e.key}: ${CurrencyUtils.format(e.value, summary.currency)}', style: const TextStyle(fontSize: 12)),
                    ]);
                  }).toList(),
                ),
                const SizedBox(height: 20),
              ],

              // ── Daily Average ──────────────────────────────────────
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(children: [
                    const Icon(Icons.calendar_today, size: 28, color: AppTheme.secondary),
                    const SizedBox(width: 12),
                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Daily Average', style: TextStyle(color: Colors.grey)),
                      Text(
                        trip.durationDays > 0
                            ? CurrencyUtils.format(summary.totalSpent / trip.durationDays, summary.currency)
                            : CurrencyUtils.format(0, summary.currency),
                        style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                      ),
                    ]),
                  ]),
                ),
              ),
              const SizedBox(height: 20),

              // ── Budget Alert ───────────────────────────────────────
              if (summary.isOverBudget)
                _alertCard('Over Budget!', 'You\'ve exceeded your budget.', Colors.red),
              if (summary.isNearLimit && !summary.isOverBudget)
                _alertCard('Budget Warning', 'You\'ve used ${summary.percentUsed.toStringAsFixed(0)}% of budget.', AppTheme.warning),

              // ── Recent Expenses ────────────────────────────────────
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Recent Expenses', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  TextButton(onPressed: () {}, child: const Text('View All')),
                ],
              ),
              expensesAsync.when(
                data: (expenses) {
                  if (expenses.isEmpty) {
                    return const Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: Text('No expenses yet', style: TextStyle(color: Colors.grey))),
                    );
                  }
                  return Column(
                    children: expenses.reversed.take(10).map((e) => _ExpenseTile(expense: e, ref: ref, tripId: trip.id)).toList(),
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Text('Error: $e'),
              ),
            ],
          ),
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _showAddExpense(context, trip.id, trip.currency),
        child: const Icon(Icons.add),
      ),
    );
  }

  List<PieChartSectionData> _buildPieSections(BudgetSummary s) {
    return s.categorySpending.entries.map((e) {
      final pct = s.totalSpent > 0 ? (e.value / s.totalSpent) * 100 : 0.0;
      return PieChartSectionData(
        value: e.value,
        color: _catColor(e.key),
        title: '${pct.toStringAsFixed(0)}%',
        titleStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white),
        radius: 50,
      );
    }).toList();
  }

  Color _catColor(String cat) {
    const colors = {
      'Accommodation': Color(0xFF1565C0),
      'Food & Dining': Color(0xFFFF6F00),
      'Transportation': Color(0xFF00897B),
      'Activities & Tours': Color(0xFF7B1FA2),
      'Shopping': Color(0xFFC62828),
      'Health & Medical': Color(0xFF2E7D32),
      'Communication': Color(0xFF00838F),
      'Emergency': Color(0xFFD32F2F),
      'Other': Color(0xFF757575),
    };
    return colors[cat] ?? Colors.grey;
  }

  Widget _alertCard(String title, String msg, Color color) => Card(
        color: color.withValues(alpha: 0.1),
        margin: const EdgeInsets.only(bottom: 16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Icon(Icons.warning_amber, color: color),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(fontWeight: FontWeight.bold, color: color)),
              Text(msg, style: TextStyle(fontSize: 13, color: color.withValues(alpha: 0.8))),
            ])),
          ]),
        ),
      );

  void _showAddExpense(BuildContext context, String tripId, String currency) {
    final amtCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    String cat = AppConfig.expenseCategories.first;
    PaymentMethod pm = PaymentMethod.cash;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.of(ctx).viewInsets.bottom + 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Add Expense', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              TextField(controller: amtCtrl, keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: 'Amount ($currency)', prefixIcon: const Icon(Icons.attach_money))),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: cat,
                items: AppConfig.expenseCategories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                onChanged: (v) => setSheet(() => cat = v!),
                decoration: const InputDecoration(labelText: 'Category', prefixIcon: Icon(Icons.category)),
              ),
              const SizedBox(height: 12),
              TextField(controller: descCtrl, decoration: const InputDecoration(labelText: 'Description', prefixIcon: Icon(Icons.notes))),
              const SizedBox(height: 12),
              DropdownButtonFormField<PaymentMethod>(
                initialValue: pm,
                items: PaymentMethod.values.map((m) => DropdownMenuItem(
                  value: m,
                  child: Text(m.name[0].toUpperCase() + m.name.substring(1)),
                )).toList(),
                onChanged: (v) => setSheet(() => pm = v!),
                decoration: const InputDecoration(labelText: 'Payment', prefixIcon: Icon(Icons.payment)),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    final amt = double.tryParse(amtCtrl.text);
                    if (amt == null || amt <= 0) return;
                    ref.read(expensesProvider(tripId).notifier).add(
                      amount: amt, currency: currency, category: cat,
                      description: descCtrl.text, paymentMethod: pm,
                    );
                    ref.invalidate(budgetSummaryProvider(tripId));
                    Navigator.pop(ctx);
                  },
                  child: const Text('Add Expense'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BudgetOverview extends StatelessWidget {
  final BudgetSummary summary;
  const _BudgetOverview({required this.summary});

  @override
  Widget build(BuildContext context) {
    final pct = summary.percentUsed.clamp(0.0, 100.0);
    final color = summary.isOverBudget ? Colors.red : summary.isNearLimit ? AppTheme.warning : AppTheme.success;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              _metric('Budget', CurrencyUtils.format(summary.totalBudget, summary.currency), Colors.grey[700]!),
              _metric('Spent', CurrencyUtils.format(summary.totalSpent, summary.currency), color),
              _metric('Left', CurrencyUtils.format(summary.remaining.abs(), summary.currency),
                  summary.isOverBudget ? Colors.red : AppTheme.success),
            ]),
            const SizedBox(height: 16),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(value: pct / 100, minHeight: 12,
                  backgroundColor: Colors.grey[200], valueColor: AlwaysStoppedAnimation(color)),
            ),
            const SizedBox(height: 4),
            Text('${pct.toStringAsFixed(1)}% used', style: TextStyle(fontSize: 12, color: Colors.grey[600])),
          ],
        ),
      ),
    );
  }

  Widget _metric(String label, String value, Color color) => Column(children: [
        Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: color)),
      ]);
}

class _ExpenseTile extends StatelessWidget {
  final Expense expense;
  final WidgetRef ref;
  final String tripId;
  const _ExpenseTile({required this.expense, required this.ref, required this.tripId});

  @override
  Widget build(BuildContext context) => Dismissible(
        key: Key(expense.id),
        direction: DismissDirection.endToStart,
        background: Container(
          color: Colors.red, alignment: Alignment.centerRight,
          padding: const EdgeInsets.only(right: 16),
          child: const Icon(Icons.delete, color: Colors.white),
        ),
        onDismissed: (_) {
          ref.read(expensesProvider(tripId).notifier).remove(expense.id);
          ref.invalidate(budgetSummaryProvider(tripId));
        },
        child: ListTile(
          leading: CircleAvatar(
            backgroundColor: Colors.grey[100],
            child: Icon(_catIcon(expense.category), size: 20, color: AppTheme.primary),
          ),
          title: Text(expense.description ?? expense.category),
          subtitle: Text('${expense.paymentMethod.name} • ${expense.date.month}/${expense.date.day}'),
          trailing: Text(CurrencyUtils.format(expense.amount, expense.currency),
              style: const TextStyle(fontWeight: FontWeight.bold)),
        ),
      );

  IconData _catIcon(String cat) {
    switch (cat) {
      case 'Accommodation': return Icons.hotel;
      case 'Food & Dining': return Icons.restaurant;
      case 'Transportation': return Icons.directions_car;
      case 'Activities & Tours': return Icons.attractions;
      case 'Shopping': return Icons.shopping_bag;
      case 'Health & Medical': return Icons.medical_services;
      default: return Icons.receipt;
    }
  }
}
