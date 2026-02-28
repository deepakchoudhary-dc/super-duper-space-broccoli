import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/date_utils.dart';
import '../../core/utils/currency_utils.dart';
import '../../data/models/trip.dart';
import '../../data/models/place.dart';

import 'budget_screen.dart';

class TripsScreen extends ConsumerStatefulWidget {
  const TripsScreen({super.key});
  @override ConsumerState<TripsScreen> createState() => _TripsScreenState();
}

class _TripsScreenState extends ConsumerState<TripsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  @override void initState() { super.initState(); _tabs = TabController(length: 3, vsync: this); }
  @override void dispose() { _tabs.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final tripsAsync = ref.watch(tripsProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Trips'),
        bottom: TabBar(controller: _tabs, tabs: const [Tab(text: 'Upcoming'), Tab(text: 'Ongoing'), Tab(text: 'Past')],
          indicatorColor: AppTheme.primary, labelColor: AppTheme.primary),
      ),
      body: tripsAsync.when(
        data: (trips) {
          final upcoming = trips.where((t) => t.isUpcoming).toList()..sort((a, b) => a.startDate.compareTo(b.startDate));
          final ongoing = trips.where((t) => t.isOngoing).toList();
          final past = trips.where((t) => t.isPast).toList()..sort((a, b) => b.endDate.compareTo(a.endDate));
          return TabBarView(controller: _tabs, children: [
            _TripList(trips: upcoming, empty: 'No upcoming trips', ref: ref),
            _TripList(trips: ongoing, empty: 'No ongoing trips', ref: ref),
            _TripList(trips: past, empty: 'No past trips', ref: ref),
          ]);
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCreateTrip(context), icon: const Icon(Icons.add), label: const Text('New Trip')),
    );
  }

  void _showCreateTrip(BuildContext context) {
    showModalBottomSheet(context: context, isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => _CreateTripSheet(ref: ref));
  }
}

class _TripList extends StatelessWidget {
  final List<Trip> trips; final String empty; final WidgetRef ref;
  const _TripList({required this.trips, required this.empty, required this.ref});
  @override Widget build(BuildContext context) {
    if (trips.isEmpty) {
      return Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.luggage, size: 64, color: Colors.grey[300]),
        const SizedBox(height: 12),
        Text(empty, style: TextStyle(color: Colors.grey[600])),
      ]));
    }
    return ListView.builder(padding: const EdgeInsets.all(16), itemCount: trips.length,
      itemBuilder: (_, i) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1), duration: Duration(milliseconds: 400 + i * 80), curve: Curves.easeOutCubic,
        builder: (_, v, c) => Transform.translate(offset: Offset(0, 20 * (1 - v)), child: Opacity(opacity: v, child: c)),
        child: _DetailedTripCard(trip: trips[i], index: i, ref: ref),
      ));
  }
}

class _DetailedTripCard extends StatelessWidget {
  final Trip trip; final int index; final WidgetRef ref;
  const _DetailedTripCard({required this.trip, required this.index, required this.ref});
  @override Widget build(BuildContext context) {
    final gradient = AppTheme.tripGradients[index % AppTheme.tripGradients.length];
    final acts = trip.dayPlans.fold<int>(0, (s, d) => s + d.activities.length);
    return Padding(padding: const EdgeInsets.only(bottom: 12), child: GestureDetector(
      onTap: () {
        ref.read(currentTripProvider.notifier).state = trip;
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => _TripDetailPage(tripId: trip.id)));
      },
      child: Container(
        decoration: BoxDecoration(color: Theme.of(context).cardColor, borderRadius: BorderRadius.circular(20), boxShadow: AppTheme.cardShadow),
        child: Column(children: [
          // Gradient header
          Container(height: 80, decoration: BoxDecoration(gradient: gradient, borderRadius: const BorderRadius.vertical(top: Radius.circular(20))),
            child: Padding(padding: const EdgeInsets.all(16), child: Row(children: [
              Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(12)),
                child: const Icon(Icons.flight_takeoff, color: Colors.white)),
              const SizedBox(width: 14),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(trip.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 17)),
                Text(trip.destination, style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 13)),
              ])),
              PopupMenuButton(itemBuilder: (_) => [const PopupMenuItem(value: 'delete', child: Text('Delete'))],
                onSelected: (v) { if (v == 'delete') ref.read(tripsProvider.notifier).delete(trip.id); },
                icon: const Icon(Icons.more_vert, color: Colors.white)),
            ]))),
          // Details
          Padding(padding: const EdgeInsets.all(14), child: Row(children: [
            _chip(Icons.calendar_today, '${AppDateUtils.formatShort(trip.startDate)} \u2013 ${AppDateUtils.formatShort(trip.endDate)}'),
            const SizedBox(width: 8),
            _chip(Icons.schedule, '${trip.durationDays}d'),
            const SizedBox(width: 8),
            _chip(Icons.account_balance_wallet, CurrencyUtils.formatCompact(trip.budget, trip.currency)),
            if (acts > 0) ...[const SizedBox(width: 8), _chip(Icons.place, '$acts spots')],
          ])),
        ]),
      ),
    ));
  }
  Widget _chip(IconData icon, String text) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(color: AppTheme.primary.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(8)),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 12, color: AppTheme.primary), const SizedBox(width: 4),
      Text(text, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
    ]),
  );
}

// ══ Trip Detail Page with Day Planning ══════════════════════════════
class _TripDetailPage extends ConsumerStatefulWidget {
  final String tripId;
  const _TripDetailPage({required this.tripId});
  @override ConsumerState<_TripDetailPage> createState() => _TripDetailPageState();
}

class _TripDetailPageState extends ConsumerState<_TripDetailPage> {
  List<Place> _suggested = [];
  bool _loadingSuggestions = false;
  final _uuid = const Uuid();

  @override void initState() { super.initState(); _loadSuggestions(); }

  Future<void> _loadSuggestions() async {
    setState(() => _loadingSuggestions = true);
    try {
      final places = await ref.read(placesServiceProvider).searchNearby(lat: 35.6762, lng: 139.6503, type: 'tourist_attraction');
      // Also fetch restaurants and museums for variety
      final food = await ref.read(placesServiceProvider).searchNearby(lat: 35.680, lng: 139.655, type: 'restaurant');
      final culture = await ref.read(placesServiceProvider).searchNearby(lat: 35.672, lng: 139.645, type: 'museum');
      if (mounted) setState(() { _suggested = [...places, ...food, ...culture]; _loadingSuggestions = false; });
    } catch (_) { if (mounted) setState(() => _loadingSuggestions = false); }
  }

  @override
  Widget build(BuildContext context) {
    final tripsAsync = ref.watch(tripsProvider);
    final allTrips = tripsAsync.valueOrNull ?? [];
    final tripList = allTrips.where((t) => t.id == widget.tripId).toList();
    if (tripList.isEmpty) return Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator()));
    final trip = tripList.first;

    return Scaffold(
      body: CustomScrollView(slivers: [
        // Trip header
        SliverAppBar(expandedHeight: 200, pinned: true,
          flexibleSpace: FlexibleSpaceBar(
            background: Container(
              decoration: BoxDecoration(gradient: AppTheme.tripGradients[trip.name.hashCode.abs() % AppTheme.tripGradients.length]),
              child: SafeArea(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 20), child: Column(
                mainAxisAlignment: MainAxisAlignment.end, crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(trip.name, style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Row(children: [
                    const Icon(Icons.place, color: Colors.white70, size: 16),
                    Text(' ${trip.destination}', style: const TextStyle(color: Colors.white70, fontSize: 14)),
                    const SizedBox(width: 12),
                    const Icon(Icons.calendar_today, color: Colors.white70, size: 14),
                    Text(' ${AppDateUtils.formatShort(trip.startDate)} \u2013 ${AppDateUtils.formatShort(trip.endDate)}',
                      style: const TextStyle(color: Colors.white70, fontSize: 13)),
                  ]),
                  const SizedBox(height: 16),
                ],
              ))),
            ),
          ),
        ),

        // Budget summary bar
        SliverToBoxAdapter(child: Padding(
          padding: const EdgeInsets.all(16),
          child: GestureDetector(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const BudgetScreen())),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Theme.of(context).cardColor, borderRadius: BorderRadius.circular(16), boxShadow: AppTheme.cardShadow),
              child: Row(children: [
                Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(gradient: AppTheme.sunsetGradient, borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.account_balance_wallet, color: Colors.white, size: 20)),
                const SizedBox(width: 14),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Budget', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                  Text('${CurrencyUtils.format(trip.budget, trip.currency)} total', style: TextStyle(color: Colors.grey[500], fontSize: 12)),
                ])),
                const Icon(Icons.chevron_right, color: Colors.grey),
              ]),
            ),
          ),
        )),

        // Generate AI button (if no itinerary)
        if (trip.dayPlans.isEmpty) SliverToBoxAdapter(child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [AppTheme.primary.withValues(alpha: 0.05), AppTheme.accent.withValues(alpha: 0.05)]),
              borderRadius: BorderRadius.circular(20), border: Border.all(color: AppTheme.primary.withValues(alpha: 0.15)),
            ),
            child: Column(children: [
              TweenAnimationBuilder<double>(tween: Tween(begin: 0, end: 1), duration: const Duration(seconds: 1), curve: Curves.elasticOut,
                builder: (_, v, c) => Transform.scale(scale: v, child: c),
                child: Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(gradient: AppTheme.primaryGradient, shape: BoxShape.circle),
                  child: const Icon(Icons.auto_awesome, color: Colors.white, size: 32))),
              const SizedBox(height: 16),
              const Text('Generate AI Itinerary', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              Text('Let AI plan your perfect trip with optimized routes', style: TextStyle(color: Colors.grey[500], fontSize: 13), textAlign: TextAlign.center),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () async {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Generating AI itinerary...')));
                  try {
                    await ref.read(tripsProvider.notifier).generateItinerary(trip);
                    if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Itinerary ready!')));
                  } catch (e) { if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'))); }
                },
                icon: const Icon(Icons.auto_awesome), label: const Text('Generate Now'),
              ),
            ]),
          ),
        )),

        // Day plans
        if (trip.dayPlans.isNotEmpty) ...[
          SliverToBoxAdapter(child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Row(children: [
              const Text('Itinerary', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(width: 8),
              Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: AppTheme.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
                child: Text('${trip.dayPlans.length} days', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppTheme.primary))),
            ]),
          )),
          SliverList(delegate: SliverChildBuilderDelegate(
            (_, i) => _DayPlanSection(
              trip: trip, day: trip.dayPlans[i], dayIndex: i,
              suggested: _suggested, loadingSuggestions: _loadingSuggestions,
              onAddActivity: (place) => _addActivity(trip, i, place),
              onRemoveActivity: (actId) => _removeActivity(trip, i, actId),
            ),
            childCount: trip.dayPlans.length,
          )),
        ],

        // Suggested places (when no itinerary)
        if (trip.dayPlans.isEmpty && _suggested.isNotEmpty) ...[
          SliverToBoxAdapter(child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
            child: Row(children: [
              const Icon(Icons.lightbulb, color: AppTheme.gold, size: 20),
              const SizedBox(width: 8),
              const Text('Popular Places Nearby', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              if (_loadingSuggestions) ...[const SizedBox(width: 8), const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))],
            ]),
          )),
          SliverList(delegate: SliverChildBuilderDelegate(
            (_, i) => _SuggestedPlaceTile(place: _suggested[i], index: i),
            childCount: _suggested.length,
          )),
        ],

        const SliverToBoxAdapter(child: SizedBox(height: 100)),
      ]),
    );
  }

  void _addActivity(Trip trip, int dayIndex, Place place) {
    final activity = Activity(
      id: _uuid.v4(), name: place.name, description: place.description,
      latitude: place.latitude, longitude: place.longitude,
      address: place.address, type: ActivityType.attraction,
      placeId: place.id, rating: place.rating,
    );
    ref.read(tripsProvider.notifier).updateTrip(
      trip.copyWith(dayPlans: List.of(trip.dayPlans)..[dayIndex] = trip.dayPlans[dayIndex].copyWith(
        activities: [...trip.dayPlans[dayIndex].activities, activity],
      )),
    );
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Added ${place.name}')));
  }

  void _removeActivity(Trip trip, int dayIndex, String actId) {
    ref.read(tripsProvider.notifier).updateTrip(
      trip.copyWith(dayPlans: List.of(trip.dayPlans)..[dayIndex] = trip.dayPlans[dayIndex].copyWith(
        activities: trip.dayPlans[dayIndex].activities.where((a) => a.id != actId).toList(),
      )),
    );
  }
}

class _DayPlanSection extends StatefulWidget {
  final Trip trip; final DayPlan day; final int dayIndex;
  final List<Place> suggested; final bool loadingSuggestions;
  final void Function(Place) onAddActivity;
  final void Function(String) onRemoveActivity;
  const _DayPlanSection({required this.trip, required this.day, required this.dayIndex,
    required this.suggested, required this.loadingSuggestions,
    required this.onAddActivity, required this.onRemoveActivity});
  @override State<_DayPlanSection> createState() => _DayPlanSectionState();
}

class _DayPlanSectionState extends State<_DayPlanSection> {
  bool _showSuggestions = false;

  @override Widget build(BuildContext context) {
    final day = widget.day;
    final existingIds = day.activities.map((a) => a.placeId).whereType<String>().toSet();
    final available = widget.suggested.where((p) => !existingIds.contains(p.id)).toList();

    return Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6), child: Container(
      decoration: BoxDecoration(color: Theme.of(context).cardColor, borderRadius: BorderRadius.circular(20), boxShadow: AppTheme.cardShadow),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Day header
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [AppTheme.primary.withValues(alpha: 0.08), Colors.transparent]),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Row(children: [
            Container(width: 40, height: 40, decoration: const BoxDecoration(gradient: AppTheme.primaryGradient, shape: BoxShape.circle),
              child: Center(child: Text('${day.dayNumber}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)))),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Day ${day.dayNumber}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              Text(AppDateUtils.formatDate(day.date), style: TextStyle(color: Colors.grey[500], fontSize: 12)),
            ])),
            if (day.weather != null) Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: day.weather!.isGoodForOutdoor ? AppTheme.success.withValues(alpha: 0.1) : AppTheme.warning.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(day.weather!.isGoodForOutdoor ? Icons.wb_sunny : Icons.cloud, size: 14, color: day.weather!.isGoodForOutdoor ? AppTheme.success : AppTheme.warning),
                const SizedBox(width: 4),
                Text('${day.weather!.temperature.round()}\u00B0', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold,
                  color: day.weather!.isGoodForOutdoor ? AppTheme.success : AppTheme.warning)),
              ]),
            ),
          ]),
        ),

        // Activities timeline
        if (day.activities.isNotEmpty)
          ...day.activities.asMap().entries.map((e) => _ActivityTile(
            activity: e.value, isLast: e.key == day.activities.length - 1,
            onRemove: () => widget.onRemoveActivity(e.value.id),
          )),

        if (day.activities.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Center(
          child: Text('No activities yet \u2014 add some below!', style: TextStyle(color: Colors.grey[400], fontStyle: FontStyle.italic)),
        )),

        // Add more places toggle
        Padding(padding: const EdgeInsets.fromLTRB(14, 0, 14, 4), child: TextButton.icon(
          onPressed: () => setState(() => _showSuggestions = !_showSuggestions),
          icon: Icon(_showSuggestions ? Icons.expand_less : Icons.add_circle_outline, size: 18),
          label: Text(_showSuggestions ? 'Hide suggestions' : 'Discover places to add', style: const TextStyle(fontSize: 13)),
        )),

        // Suggested places
        if (_showSuggestions) Container(
          margin: const EdgeInsets.fromLTRB(14, 0, 14, 14),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppTheme.primary.withValues(alpha: 0.03),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppTheme.primary.withValues(alpha: 0.1)),
          ),
          child: widget.loadingSuggestions
            ? const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator(strokeWidth: 2)))
            : available.isEmpty
              ? const Padding(padding: EdgeInsets.all(8), child: Text('All available places already added!', style: TextStyle(color: Colors.grey)))
              : Column(children: [
                  Row(children: [
                    const Icon(Icons.lightbulb, color: AppTheme.gold, size: 16),
                    const SizedBox(width: 6),
                    Text('Suggested for Day ${day.dayNumber}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  ]),
                  const SizedBox(height: 8),
                  ...available.take(5).map((p) => _SuggestTile(place: p, onAdd: () => widget.onAddActivity(p))),
                ]),
        ),
      ]),
    ));
  }
}

class _ActivityTile extends StatelessWidget {
  final Activity activity; final bool isLast; final VoidCallback onRemove;
  const _ActivityTile({required this.activity, required this.isLast, required this.onRemove});
  @override Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 14),
    child: IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SizedBox(width: 30, child: Column(children: [
        Container(width: 10, height: 10, decoration: BoxDecoration(color: AppTheme.primary, shape: BoxShape.circle)),
        if (!isLast) Expanded(child: Container(width: 2, color: AppTheme.primary.withValues(alpha: 0.2))),
      ])),
      const SizedBox(width: 8),
      Expanded(child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: AppTheme.primary.withValues(alpha: 0.04), borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          Icon(_actIcon(activity.type), size: 18, color: AppTheme.primary),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(activity.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            if (activity.address != null) Text(activity.address!, style: TextStyle(color: Colors.grey[500], fontSize: 11), maxLines: 1, overflow: TextOverflow.ellipsis),
          ])),
          if (activity.rating != null) Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.star, size: 12, color: AppTheme.gold),
            Text(' ${activity.rating!.toStringAsFixed(1)}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
          ]),
          IconButton(icon: Icon(Icons.close, size: 16, color: Colors.grey[400]), onPressed: onRemove, visualDensity: VisualDensity.compact, padding: EdgeInsets.zero),
        ]),
      )),
    ])),
  );
  static IconData _actIcon(ActivityType t) {
    switch (t) {
      case ActivityType.restaurant: return Icons.restaurant;
      case ActivityType.accommodation: return Icons.hotel;
      case ActivityType.museum: return Icons.museum;
      case ActivityType.shopping: return Icons.shopping_bag;
      case ActivityType.nature: return Icons.park;
      case ActivityType.entertainment: return Icons.theater_comedy;
      case ActivityType.nightlife: return Icons.nightlife;
      default: return Icons.place;
    }
  }
}

class _SuggestTile extends StatelessWidget {
  final Place place; final VoidCallback onAdd;
  const _SuggestTile({required this.place, required this.onAdd});
  @override Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10)),
      child: Row(children: [
        Container(width: 34, height: 34, decoration: BoxDecoration(gradient: AppTheme.oceanGradient, borderRadius: BorderRadius.circular(8)),
          child: Icon(_icon(place.types), color: Colors.white, size: 16)),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(place.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
          if (place.rating != null) Row(children: [
            ...List.generate(5, (i) => Icon(i < place.rating!.round() ? Icons.star : Icons.star_border, size: 10, color: AppTheme.gold)),
            Text(' ${place.rating!.toStringAsFixed(1)}', style: const TextStyle(fontSize: 10)),
          ]),
        ])),
        ElevatedButton(
          onPressed: onAdd,
          style: ElevatedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), minimumSize: Size.zero, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
          child: const Text('Add', style: TextStyle(fontSize: 12)),
        ),
      ]),
    ),
  );
  IconData _icon(List<String> types) {
    if (types.any((t) => t.contains('restaurant'))) return Icons.restaurant;
    if (types.any((t) => t.contains('museum'))) return Icons.museum;
    if (types.any((t) => t.contains('park'))) return Icons.park;
    return Icons.place;
  }
}

class _SuggestedPlaceTile extends StatelessWidget {
  final Place place; final int index;
  const _SuggestedPlaceTile({required this.place, required this.index});
  @override Widget build(BuildContext context) => TweenAnimationBuilder<double>(
    tween: Tween(begin: 0, end: 1), duration: Duration(milliseconds: 400 + index * 80), curve: Curves.easeOutCubic,
    builder: (_, v, c) => Transform.translate(offset: Offset(0, 16 * (1 - v)), child: Opacity(opacity: v, child: c)),
    child: Padding(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4), child: Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Theme.of(context).cardColor, borderRadius: BorderRadius.circular(14), boxShadow: AppTheme.cardShadow),
      child: Row(children: [
        Container(width: 44, height: 44, decoration: BoxDecoration(gradient: AppTheme.tripGradients[index % AppTheme.tripGradients.length], borderRadius: BorderRadius.circular(12)),
          child: const Icon(Icons.place, color: Colors.white, size: 20)),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(place.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
          if (place.address != null) Text(place.address!, style: TextStyle(color: Colors.grey[500], fontSize: 11), maxLines: 1, overflow: TextOverflow.ellipsis),
        ])),
        if (place.rating != null) Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(color: AppTheme.gold.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.star, size: 14, color: AppTheme.gold),
            Text(' ${place.rating!.toStringAsFixed(1)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
          ]),
        ),
      ]),
    )),
  );
}

// ══ Create Trip Sheet ═══════════════════════════════════════════════
class _CreateTripSheet extends StatefulWidget {
  final WidgetRef ref;
  const _CreateTripSheet({required this.ref});
  @override State<_CreateTripSheet> createState() => _CreateTripSheetState();
}
class _CreateTripSheetState extends State<_CreateTripSheet> {
  final _nameCtrl = TextEditingController(), _destCtrl = TextEditingController(), _budgetCtrl = TextEditingController(text: '1000');
  DateTime _start = DateTime.now().add(const Duration(days: 7)), _end = DateTime.now().add(const Duration(days: 14));
  String _currency = 'USD', _style = 'moderate', _pace = 'moderate';
  final _interests = <String>{};
  bool _generating = false;
  static const _allInterests = ['Food','Art','History','Nature','Adventure','Shopping','Nightlife','Architecture','Beach','Culture','Photography','Music'];

  @override Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(left: 20, right: 20, top: 16, bottom: MediaQuery.of(context).viewInsets.bottom + 20),
    child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
      Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)))),
      const SizedBox(height: 16),
      const Text('Create New Trip', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
      const SizedBox(height: 16),
      TextField(controller: _nameCtrl, decoration: const InputDecoration(labelText: 'Trip Name', prefixIcon: Icon(Icons.trip_origin))),
      const SizedBox(height: 12),
      TextField(controller: _destCtrl, decoration: const InputDecoration(labelText: 'Destination', prefixIcon: Icon(Icons.place))),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: _DateField(label: 'Start', date: _start, onPick: (d) => setState(() => _start = d))),
        const SizedBox(width: 12),
        Expanded(child: _DateField(label: 'End', date: _end, onPick: (d) => setState(() => _end = d))),
      ]),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: TextField(controller: _budgetCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Budget', prefixIcon: Icon(Icons.account_balance_wallet)))),
        const SizedBox(width: 12),
        SizedBox(width: 100, child: DropdownButtonFormField<String>(initialValue: _currency, items: ['USD','EUR','GBP','JPY','INR'].map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(), onChanged: (v) => setState(() => _currency = v!), decoration: const InputDecoration(labelText: 'Cur.'))),
      ]),
      const SizedBox(height: 16),
      const Text('Travel Style', style: TextStyle(fontWeight: FontWeight.bold)),
      const SizedBox(height: 8),
      SegmentedButton<String>(segments: const [ButtonSegment(value: 'budget', label: Text('Budget')), ButtonSegment(value: 'moderate', label: Text('Moderate')), ButtonSegment(value: 'luxury', label: Text('Luxury'))],
        selected: {_style}, onSelectionChanged: (s) => setState(() => _style = s.first)),
      const SizedBox(height: 12),
      const Text('Pace', style: TextStyle(fontWeight: FontWeight.bold)),
      const SizedBox(height: 8),
      SegmentedButton<String>(segments: const [ButtonSegment(value: 'relaxed', label: Text('Relaxed')), ButtonSegment(value: 'moderate', label: Text('Moderate')), ButtonSegment(value: 'packed', label: Text('Packed'))],
        selected: {_pace}, onSelectionChanged: (s) => setState(() => _pace = s.first)),
      const SizedBox(height: 12),
      const Text('Interests', style: TextStyle(fontWeight: FontWeight.bold)),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 4, children: _allInterests.map((i) => FilterChip(label: Text(i), selected: _interests.contains(i),
        onSelected: (s) => setState(() => s ? _interests.add(i) : _interests.remove(i)))).toList()),
      const SizedBox(height: 20),
      Row(children: [
        Expanded(child: OutlinedButton(onPressed: _generating ? null : () => _save(false), child: const Text('Save'))),
        const SizedBox(width: 12),
        Expanded(child: ElevatedButton.icon(
          onPressed: _generating ? null : () => _save(true),
          icon: _generating ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.auto_awesome),
          label: Text(_generating ? 'Generating...' : 'AI Generate'),
        )),
      ]),
      const SizedBox(height: 8),
    ])),
  );

  Future<void> _save(bool ai) async {
    if (_nameCtrl.text.isEmpty || _destCtrl.text.isEmpty) { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Fill name and destination'))); return; }
    setState(() => _generating = ai);
    try {
      final trip = await widget.ref.read(tripsProvider.notifier).create(
        name: _nameCtrl.text, destination: _destCtrl.text, startDate: _start, endDate: _end,
        budget: double.tryParse(_budgetCtrl.text) ?? 1000, currency: _currency,
        preferences: TripPreferences(travelStyle: _style, travelPace: _pace, interests: _interests.toList()));
      if (ai) await widget.ref.read(tripsProvider.notifier).generateItinerary(trip);
      if (mounted) Navigator.pop(context);
    } catch (e) { if (mounted) { setState(() => _generating = false); ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'))); } }
  }
}

class _DateField extends StatelessWidget {
  final String label; final DateTime date; final ValueChanged<DateTime> onPick;
  const _DateField({required this.label, required this.date, required this.onPick});
  @override Widget build(BuildContext context) => InkWell(
    onTap: () async {
      final picked = await showDatePicker(context: context, initialDate: date,
        firstDate: DateTime.now().subtract(const Duration(days: 30)),
        lastDate: DateTime.now().add(const Duration(days: 730)));
      if (picked != null) onPick(picked);
    },
    child: InputDecorator(decoration: InputDecoration(labelText: label, prefixIcon: const Icon(Icons.calendar_today)),
      child: Text(AppDateUtils.formatShort(date))),
  );
}
