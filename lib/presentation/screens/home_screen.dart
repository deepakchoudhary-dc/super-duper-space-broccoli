import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/date_utils.dart';
import '../../data/models/trip.dart';
import '../../data/services/ai_service.dart';

Widget _slideIn(int index, Widget child) => TweenAnimationBuilder<double>(
  tween: Tween(begin: 0, end: 1),
  duration: Duration(milliseconds: 500 + index * 80),
  curve: Curves.easeOutCubic,
  builder: (_, v, c) => Transform.translate(offset: Offset(0, 24 * (1 - v)), child: Opacity(opacity: v, child: c)),
  child: child,
);

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tripsAsync = ref.watch(tripsProvider);
    final trips = tripsAsync.valueOrNull ?? [];
    final ongoing = trips.where((t) => t.isOngoing).toList();

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // Hero Header
          SliverAppBar(
            expandedHeight: 260, pinned: true,
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                decoration: const BoxDecoration(gradient: AppTheme.primaryGradient),
                child: SafeArea(child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const SizedBox(height: 32),
                    TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0, end: 1),
                      duration: const Duration(milliseconds: 800),
                      curve: Curves.elasticOut,
                      builder: (_, v, c) => Transform.scale(scale: v, child: c),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.15),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.public, size: 48, color: Colors.white),
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text('Travel Companion', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
                    const SizedBox(height: 6),
                    Text('Your AI-Powered Journey Planner', style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 14, letterSpacing: 0.5)),
                  ],
                )),
              ),
            ),
          ),

          // Stats strip
          SliverToBoxAdapter(child: _slideIn(0, Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
            child: Row(children: [
              _StatBadge(icon: Icons.flight, value: '${trips.length}', label: 'Trips', gradient: AppTheme.primaryGradient),
              const SizedBox(width: 10),
              _StatBadge(icon: Icons.calendar_today, value: '${trips.fold<int>(0, (s, t) => s + t.durationDays)}', label: 'Days', gradient: AppTheme.oceanGradient),
              const SizedBox(width: 10),
              _StatBadge(icon: Icons.place, value: '${trips.map((t) => t.destination).toSet().length}', label: 'Places', gradient: AppTheme.sunsetGradient),
            ]),
          ))),

          // Quick Actions
          SliverToBoxAdapter(child: _slideIn(1, Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Quick Actions', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              SizedBox(height: 90, child: ListView(scrollDirection: Axis.horizontal, children: [
                _ActionCard(icon: Icons.add_location_alt, label: 'New Trip', gradient: AppTheme.primaryGradient, onTap: () => ref.read(bottomNavIndexProvider.notifier).state = 1),
                _ActionCard(icon: Icons.explore, label: 'Explore', gradient: AppTheme.oceanGradient, onTap: () => ref.read(bottomNavIndexProvider.notifier).state = 2),
                _ActionCard(icon: Icons.auto_awesome, label: 'AI Chat', gradient: AppTheme.emeraldGradient, onTap: () => ref.read(bottomNavIndexProvider.notifier).state = 3),
                _ActionCard(icon: Icons.currency_exchange, label: 'Currency', gradient: AppTheme.sunsetGradient, onTap: () => _showCurrencyConverter(context, ref)),
                _ActionCard(icon: Icons.sos, label: 'Emergency', gradient: const LinearGradient(colors: [Color(0xFFFF5252), Color(0xFFFF1744)]), onTap: () => ref.read(bottomNavIndexProvider.notifier).state = 4),
                _ActionCard(icon: Icons.translate, label: 'Translate', gradient: const LinearGradient(colors: [Color(0xFF667EEA), Color(0xFF764BA2)]), onTap: () => _showTranslator(context, ref)),
              ])),
            ]),
          ))),

          // Active Trip Banner
          if (ongoing.isNotEmpty) SliverToBoxAdapter(child: _slideIn(2, _ActiveTripBanner(trip: ongoing.first, ref: ref))),

          // Your Trips header
          SliverToBoxAdapter(child: _slideIn(3, Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              const Text('Your Trips', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              TextButton.icon(
                onPressed: () => ref.read(bottomNavIndexProvider.notifier).state = 1,
                icon: const Icon(Icons.arrow_forward, size: 16),
                label: const Text('See All'),
              ),
            ]),
          ))),

          // Trip cards
          tripsAsync.when(
            data: (allTrips) {
              if (allTrips.isEmpty) return SliverToBoxAdapter(child: _slideIn(4, _EmptyState(onTap: () => ref.read(bottomNavIndexProvider.notifier).state = 1)));
              final sorted = List.of(allTrips)..sort((a, b) {
                if (a.isOngoing && !b.isOngoing) return -1;
                if (!a.isOngoing && b.isOngoing) return 1;
                return a.startDate.compareTo(b.startDate);
              });
              return SliverList(delegate: SliverChildBuilderDelegate(
                (_, i) => _slideIn(4 + i, _TripCard(trip: sorted[i], index: i, ref: ref)),
                childCount: sorted.length.clamp(0, 5),
              ));
            },
            loading: () => const SliverToBoxAdapter(child: Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator()))),
            error: (e, _) => SliverToBoxAdapter(child: Center(child: Text('Error: $e'))),
          ),

          // Travel Tips
          SliverToBoxAdapter(child: _slideIn(6, Padding(
            padding: const EdgeInsets.all(16),
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [AppTheme.primary.withValues(alpha: 0.05), AppTheme.accent.withValues(alpha: 0.05)]),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppTheme.primary.withValues(alpha: 0.1)),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: AppTheme.gold.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10)),
                    child: const Icon(Icons.lightbulb, color: AppTheme.gold, size: 20)),
                  const SizedBox(width: 10),
                  const Text('Pro Travel Tips', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                ]),
                const SizedBox(height: 14),
                _tipRow(Icons.security, 'Keep digital copies of all documents'),
                _tipRow(Icons.battery_full, 'Carry a portable charger everywhere'),
                _tipRow(Icons.wifi, 'Download offline maps before traveling'),
                _tipRow(Icons.medical_services, 'Pack essential medications'),
              ]),
            ),
          ))),

          const SliverToBoxAdapter(child: SizedBox(height: 80)),
        ],
      ),
    );
  }

  Widget _tipRow(IconData icon, String text) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(children: [
      Icon(icon, size: 16, color: AppTheme.primary.withValues(alpha: 0.6)),
      const SizedBox(width: 10),
      Expanded(child: Text(text, style: TextStyle(fontSize: 13, color: Colors.grey[700]))),
    ]),
  );

  void _showCurrencyConverter(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(context: context, isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => const _CurrencySheet());
  }

  void _showTranslator(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(context: context, isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => _TranslatorSheet(ai: ref.read(aiServiceProvider)));
  }
}

class _StatBadge extends StatelessWidget {
  final IconData icon; final String value; final String label; final Gradient gradient;
  const _StatBadge({required this.icon, required this.value, required this.label, required this.gradient});
  @override
  Widget build(BuildContext context) => Expanded(child: Container(
    padding: const EdgeInsets.symmetric(vertical: 14),
    decoration: BoxDecoration(gradient: gradient, borderRadius: BorderRadius.circular(16),
      boxShadow: [BoxShadow(color: (gradient as LinearGradient).colors.first.withValues(alpha: 0.25), blurRadius: 12, offset: const Offset(0, 4))]),
    child: Column(children: [
      Icon(icon, color: Colors.white, size: 22),
      const SizedBox(height: 4),
      Text(value, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
      Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 11)),
    ]),
  ));
}

class _ActionCard extends StatelessWidget {
  final IconData icon; final String label; final Gradient gradient; final VoidCallback onTap;
  const _ActionCard({required this.icon, required this.label, required this.gradient, required this.onTap});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(right: 10),
    child: GestureDetector(onTap: onTap, child: Container(
      width: 80, decoration: BoxDecoration(gradient: gradient, borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: (gradient as LinearGradient).colors.first.withValues(alpha: 0.3), blurRadius: 10, offset: const Offset(0, 4))]),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(icon, color: Colors.white, size: 26),
        const SizedBox(height: 6),
        Text(label, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
      ]),
    )),
  );
}

class _ActiveTripBanner extends StatelessWidget {
  final Trip trip; final WidgetRef ref;
  const _ActiveTripBanner({required this.trip, required this.ref});
  @override
  Widget build(BuildContext context) {
    final daysLeft = trip.endDate.difference(DateTime.now()).inDays;
    return Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 0), child: GestureDetector(
      onTap: () { ref.read(currentTripProvider.notifier).state = trip; ref.read(bottomNavIndexProvider.notifier).state = 1; },
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: AppTheme.emeraldGradient, borderRadius: BorderRadius.circular(20),
          boxShadow: [BoxShadow(color: const Color(0xFF00B09B).withValues(alpha: 0.3), blurRadius: 16, offset: const Offset(0, 6))],
        ),
        child: Row(children: [
          Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.flight_takeoff, color: Colors.white, size: 24)),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Active Trip', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 1)),
            Text(trip.name, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
            Text('${trip.destination} \u2022 $daysLeft days left', style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 12)),
          ])),
          Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(20)),
            child: const Row(mainAxisSize: MainAxisSize.min, children: [Text('View', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)), SizedBox(width: 4), Icon(Icons.arrow_forward, color: Colors.white, size: 14)])),
        ]),
      ),
    ));
  }
}

class _TripCard extends StatelessWidget {
  final Trip trip; final int index; final WidgetRef ref;
  const _TripCard({required this.trip, required this.index, required this.ref});
  @override
  Widget build(BuildContext context) {
    final gradient = AppTheme.tripGradients[index % AppTheme.tripGradients.length];
    final status = trip.isOngoing ? 'Ongoing' : trip.isUpcoming ? 'Upcoming' : 'Past';
    final statusColor = trip.isOngoing ? AppTheme.success : trip.isUpcoming ? AppTheme.primary : Colors.grey;
    return Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5), child: GestureDetector(
      onTap: () { ref.read(currentTripProvider.notifier).state = trip; ref.read(bottomNavIndexProvider.notifier).state = 1; },
      child: Container(
        decoration: BoxDecoration(color: Theme.of(context).cardColor, borderRadius: BorderRadius.circular(20), boxShadow: AppTheme.cardShadow),
        child: Row(children: [
          Container(width: 64, height: 80, decoration: BoxDecoration(gradient: gradient,
            borderRadius: const BorderRadius.only(topLeft: Radius.circular(20), bottomLeft: Radius.circular(20))),
            child: Icon(_destIcon(trip.destination), color: Colors.white, size: 26)),
          const SizedBox(width: 14),
          Expanded(child: Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(trip.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            const SizedBox(height: 2),
            Text(trip.destination, style: TextStyle(color: Colors.grey[600], fontSize: 13)),
            const SizedBox(height: 4),
            Text('${AppDateUtils.formatShort(trip.startDate)} \u2013 ${AppDateUtils.formatShort(trip.endDate)} \u2022 ${trip.durationDays}d',
              style: TextStyle(color: Colors.grey[400], fontSize: 11)),
          ]))),
          Padding(padding: const EdgeInsets.only(right: 14), child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
            child: Text(status, style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.bold)),
          )),
        ]),
      ),
    ));
  }
  IconData _destIcon(String d) {
    final l = d.toLowerCase();
    if (l.contains('tokyo') || l.contains('japan')) return Icons.temple_buddhist;
    if (l.contains('paris') || l.contains('france')) return Icons.castle;
    if (l.contains('beach') || l.contains('bali') || l.contains('hawaii')) return Icons.beach_access;
    if (l.contains('mountain') || l.contains('alps') || l.contains('nepal')) return Icons.terrain;
    if (l.contains('new york') || l.contains('london')) return Icons.location_city;
    return Icons.flight_takeoff;
  }
}

class _EmptyState extends StatelessWidget {
  final VoidCallback onTap;
  const _EmptyState({required this.onTap});
  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.all(32), child: Column(children: [
    TweenAnimationBuilder<double>(tween: Tween(begin: 0, end: 1), duration: const Duration(seconds: 1), curve: Curves.elasticOut,
      builder: (_, v, c) => Transform.scale(scale: v, child: c),
      child: Container(padding: const EdgeInsets.all(24), decoration: BoxDecoration(color: AppTheme.primary.withValues(alpha: 0.08), shape: BoxShape.circle),
        child: const Icon(Icons.flight_takeoff, size: 56, color: AppTheme.primary))),
    const SizedBox(height: 20),
    const Text('No trips yet!', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
    const SizedBox(height: 8),
    Text('Start planning your next adventure', style: TextStyle(color: Colors.grey[500])),
    const SizedBox(height: 20),
    ElevatedButton.icon(onPressed: onTap, icon: const Icon(Icons.add), label: const Text('Create Your First Trip')),
  ]));
}

class _CurrencySheet extends ConsumerStatefulWidget {
  const _CurrencySheet();
  @override ConsumerState<_CurrencySheet> createState() => _CurrencySheetState();
}
class _CurrencySheetState extends ConsumerState<_CurrencySheet> {
  final _amtCtrl = TextEditingController(text: '100');
  String _from = 'USD', _to = 'EUR';
  double? _result; bool _loading = false;
  static const _cur = ['USD','EUR','GBP','JPY','CNY','INR','AUD','CAD','CHF','KRW','THB','SGD','MXN','BRL'];
  Future<void> _convert() async {
    final amt = double.tryParse(_amtCtrl.text); if (amt == null) return;
    setState(() => _loading = true);
    try { final r = await ref.read(currencyServiceProvider).convert(amt, _from, _to); setState(() { _result = r; _loading = false; }); }
    catch (_) { setState(() => _loading = false); }
  }
  @override Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.of(context).viewInsets.bottom + 20),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2))),
      const SizedBox(height: 20),
      const Text('Currency Converter', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
      const SizedBox(height: 20),
      TextField(controller: _amtCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Amount', prefixIcon: Icon(Icons.attach_money))),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: DropdownButtonFormField<String>(initialValue: _from, items: _cur.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(), onChanged: (v) => setState(() => _from = v!), decoration: const InputDecoration(labelText: 'From'))),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: IconButton(icon: const Icon(Icons.swap_horiz, color: AppTheme.primary), onPressed: () => setState(() { final t = _from; _from = _to; _to = t; _result = null; }))),
        Expanded(child: DropdownButtonFormField<String>(initialValue: _to, items: _cur.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(), onChanged: (v) => setState(() => _to = v!), decoration: const InputDecoration(labelText: 'To'))),
      ]),
      const SizedBox(height: 20),
      SizedBox(width: double.infinity, child: ElevatedButton(onPressed: _loading ? null : _convert,
        child: _loading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Convert'))),
      if (_result != null) ...[
        const SizedBox(height: 20),
        Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(gradient: AppTheme.primaryGradient, borderRadius: BorderRadius.circular(16)),
          child: Center(child: Text('${_amtCtrl.text} $_from = ${_result!.toStringAsFixed(2)} $_to', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white)))),
      ],
      const SizedBox(height: 8),
    ]),
  );
}

class _TranslatorSheet extends StatefulWidget {
  final AiService ai;
  const _TranslatorSheet({required this.ai});
  @override State<_TranslatorSheet> createState() => _TranslatorSheetState();
}
class _TranslatorSheetState extends State<_TranslatorSheet> {
  final _textCtrl = TextEditingController();
  String _lang = 'Japanese'; String? _result; bool _loading = false;
  static const _langs = ['Spanish','French','German','Italian','Portuguese','Japanese','Chinese','Korean','Thai','Hindi','Arabic','Russian'];
  Future<void> _translate() async {
    if (_textCtrl.text.trim().isEmpty) return;
    setState(() => _loading = true);
    try { final r = await widget.ai.translate(text: _textCtrl.text.trim(), targetLang: _lang); setState(() { _result = r; _loading = false; }); }
    catch (_) { setState(() { _result = 'Translation unavailable offline'; _loading = false; }); }
  }
  @override Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.of(context).viewInsets.bottom + 20),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2))),
      const SizedBox(height: 20),
      const Text('Quick Translator', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
      const SizedBox(height: 20),
      TextField(controller: _textCtrl, decoration: const InputDecoration(labelText: 'Enter text', prefixIcon: Icon(Icons.translate)), maxLines: 2),
      const SizedBox(height: 12),
      DropdownButtonFormField<String>(initialValue: _lang, items: _langs.map((l) => DropdownMenuItem(value: l, child: Text(l))).toList(), onChanged: (v) => setState(() => _lang = v!), decoration: const InputDecoration(labelText: 'Target Language')),
      const SizedBox(height: 20),
      SizedBox(width: double.infinity, child: ElevatedButton(onPressed: _loading ? null : _translate,
        child: _loading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Translate'))),
      if (_result != null) ...[const SizedBox(height: 16), Card(child: Padding(padding: const EdgeInsets.all(16), child: SelectableText(_result!, style: const TextStyle(fontSize: 16))))],
      const SizedBox(height: 8),
    ]),
  );
}
