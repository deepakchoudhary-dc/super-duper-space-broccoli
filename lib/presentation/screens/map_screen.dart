import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/app_providers.dart';
import '../../data/models/place.dart';
import '../../core/theme/app_theme.dart';

class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});
  @override ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> with TickerProviderStateMixin {
  final _searchCtrl = TextEditingController();
  List<Place> _places = [];
  bool _loading = false;
  int _selectedCat = 0;
  Place? _selectedPlace;
  late AnimationController _pulseCtrl;
  late Animation<double> _pulseAnim;

  static const _cats = ['All', 'Food', 'Culture', 'Nature', 'Shopping'];
  static const _catIcons = [Icons.place, Icons.restaurant, Icons.museum, Icons.park, Icons.shopping_bag];

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1500))..repeat(reverse: true);
    _pulseAnim = Tween<double>(begin: 0.6, end: 1.0).animate(CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut));
    _loadPlaces();
  }

  @override void dispose() { _pulseCtrl.dispose(); _searchCtrl.dispose(); super.dispose(); }

  Future<void> _loadPlaces() async {
    setState(() => _loading = true);
    try {
      final places = await ref.read(placesServiceProvider).searchNearby(lat: 35.6762, lng: 139.6503, type: 'tourist_attraction');
      if (mounted) setState(() { _places = places; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  Future<void> _search(String q) async {
    if (q.trim().isEmpty) { _loadPlaces(); return; }
    setState(() => _loading = true);
    try {
      final places = await ref.read(placesServiceProvider).searchByText(q);
      if (mounted) setState(() { _places = places; _loading = false; });
    } catch (_) { if (mounted) setState(() => _loading = false); }
  }

  List<Place> get _filtered {
    if (_selectedCat == 0) return _places;
    final keys = [[], ['restaurant','food','cafe'], ['museum','art','history','temple'], ['park','nature','garden'], ['shopping','market']][_selectedCat];
    return _places.where((p) => p.types.any((t) => keys.any((k) => t.contains(k)))).toList();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;
    return Scaffold(
      body: CustomScrollView(slivers: [
        // Header
        SliverAppBar(
          expandedHeight: 100, pinned: true, floating: true,
          flexibleSpace: FlexibleSpaceBar(
            background: Container(
              decoration: const BoxDecoration(gradient: AppTheme.nightGradient),
              child: const SafeArea(child: Padding(
                padding: EdgeInsets.only(top: 12, left: 20),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.end, children: [
                  Text('Explore', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
                  SizedBox(height: 4),
                  Text('Discover amazing places nearby', style: TextStyle(color: Colors.white70, fontSize: 13)),
                  SizedBox(height: 16),
                ]),
              )),
            ),
          ),
        ),

        // Search bar
        SliverToBoxAdapter(child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: TextField(
            controller: _searchCtrl,
            decoration: InputDecoration(
              hintText: 'Search places, attractions...',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: _searchCtrl.text.isNotEmpty ? IconButton(icon: const Icon(Icons.clear), onPressed: () { _searchCtrl.clear(); _loadPlaces(); }) : null,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(20)),
            ),
            onSubmitted: _search,
            onChanged: (v) => setState(() {}),
          ),
        )),

        // Category chips
        SliverToBoxAdapter(child: SizedBox(height: 42, child: ListView.builder(
          scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12),
          itemCount: _cats.length,
          itemBuilder: (_, i) => Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: ChoiceChip(
            avatar: Icon(_catIcons[i], size: 16, color: _selectedCat == i ? Colors.white : AppTheme.primary),
            label: Text(_cats[i], style: TextStyle(color: _selectedCat == i ? Colors.white : null, fontWeight: FontWeight.w600, fontSize: 12)),
            selected: _selectedCat == i,
            selectedColor: AppTheme.primary,
            onSelected: (_) => setState(() => _selectedCat = i),
          )),
        ))),

        // Interactive Map Canvas
        SliverToBoxAdapter(child: Padding(
          padding: const EdgeInsets.all(16),
          child: GestureDetector(
            onTapDown: (details) => _handleMapTap(details, filtered),
            child: AnimatedBuilder(
              animation: _pulseAnim,
              builder: (_, __) => CustomPaint(
                painter: _MapPainter(places: filtered, pulse: _pulseAnim.value, selectedPlace: _selectedPlace),
                size: const Size(double.infinity, 260),
              ),
            ),
          ),
        )),

        // Selected place card
        if (_selectedPlace != null) SliverToBoxAdapter(child: _SelectedPlaceCard(
          place: _selectedPlace!, onClose: () => setState(() => _selectedPlace = null),
          onAdd: () { ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Added ${_selectedPlace!.name} to itinerary'))); },
        )),

        // Places header
        SliverToBoxAdapter(child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Row(children: [
            Text('${filtered.length} Places Found', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const Spacer(),
            if (_loading) const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
          ]),
        )),

        // Places grid
        filtered.isEmpty && !_loading
          ? SliverToBoxAdapter(child: Center(child: Padding(padding: const EdgeInsets.all(40), child: Column(children: [
              Icon(Icons.location_off, size: 48, color: Colors.grey[300]),
              const SizedBox(height: 8),
              const Text('No places found', style: TextStyle(color: Colors.grey)),
            ]))))
          : SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              sliver: SliverGrid(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 0.85),
                delegate: SliverChildBuilderDelegate(
                  (_, i) => _PlaceGridCard(place: filtered[i], index: i, onTap: () => setState(() => _selectedPlace = filtered[i])),
                  childCount: filtered.length,
                ),
              ),
            ),

        const SliverToBoxAdapter(child: SizedBox(height: 100)),
      ]),
    );
  }

  void _handleMapTap(TapDownDetails details, List<Place> places) {
    if (places.isEmpty) return;
    final box = context.findRenderObject() as RenderBox;
    final size = Size(box.size.width - 32, 260);
    final local = details.localPosition - const Offset(16, 0);
    for (int i = 0; i < places.length && i < 8; i++) {
      final pos = _MapPainter.placePosition(i, places.length, size);
      if ((local - pos).distance < 24) {
        setState(() => _selectedPlace = places[i]);
        return;
      }
    }
  }
}

class _MapPainter extends CustomPainter {
  final List<Place> places;
  final double pulse;
  final Place? selectedPlace;
  _MapPainter({required this.places, required this.pulse, this.selectedPlace});

  static Offset placePosition(int i, int total, Size size) {
    final rng = Random(i * 42);
    final cols = (total > 4) ? 4 : total;
    final row = i ~/ cols;
    final col = i % cols;
    final cellW = size.width / cols;
    final cellH = size.height / ((total / cols).ceil().clamp(1, 3));
    return Offset(
      cellW * col + cellW / 2 + (rng.nextDouble() - 0.5) * cellW * 0.3,
      cellH * row + cellH / 2 + (rng.nextDouble() - 0.5) * cellH * 0.2 + 10,
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    // Background
    final bgRect = Rect.fromLTWH(0, 0, size.width, size.height);
    final bgPaint = Paint()..shader = const LinearGradient(
      colors: [Color(0xFF0D1B2A), Color(0xFF1B2838), Color(0xFF1A2940)],
      begin: Alignment.topLeft, end: Alignment.bottomRight,
    ).createShader(bgRect);
    canvas.drawRRect(RRect.fromRectAndRadius(bgRect, const Radius.circular(20)), bgPaint);

    // Grid lines
    final gridPaint = Paint()..color = Colors.white.withValues(alpha: 0.04)..strokeWidth = 0.5;
    for (double y = 30; y < size.height; y += 40) { canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint); }
    for (double x = 30; x < size.width; x += 50) { canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint); }

    if (places.isEmpty) {
      final tp = TextPainter(text: const TextSpan(text: 'Search a location to explore', style: TextStyle(color: Colors.white38, fontSize: 14)), textDirection: TextDirection.ltr)..layout();
      tp.paint(canvas, Offset(size.width / 2 - tp.width / 2, size.height / 2 - tp.height / 2));
      return;
    }

    // Route lines
    final routePaint = Paint()..color = AppTheme.accent.withValues(alpha: 0.3)..strokeWidth = 1.5..style = PaintingStyle.stroke;
    final positions = <Offset>[];
    for (int i = 0; i < places.length && i < 8; i++) { positions.add(placePosition(i, places.length, size)); }
    for (int i = 0; i < positions.length - 1; i++) {
      _drawDashedLine(canvas, positions[i], positions[i + 1], routePaint);
    }

    // Markers
    for (int i = 0; i < positions.length; i++) {
      final pos = positions[i];
      final isSelected = selectedPlace != null && i < places.length && places[i].id == selectedPlace!.id;
      final color = _placeColor(places[i].types);

      // Pulse ring
      final pulseRadius = 18 * pulse;
      canvas.drawCircle(pos, pulseRadius, Paint()..color = color.withValues(alpha: 0.15 * pulse));

      // Outer glow
      canvas.drawCircle(pos, 14, Paint()..color = color.withValues(alpha: isSelected ? 0.4 : 0.2)..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8));

      // Marker circle
      canvas.drawCircle(pos, 10, Paint()..color = color);
      canvas.drawCircle(pos, 10, Paint()..color = Colors.white..style = PaintingStyle.stroke..strokeWidth = 2);
      canvas.drawCircle(pos, 3, Paint()..color = Colors.white);

      // Label
      final name = places[i].name.length > 14 ? '${places[i].name.substring(0, 12)}..' : places[i].name;
      final tp = TextPainter(
        text: TextSpan(text: name, style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 9, fontWeight: FontWeight.w600)),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: 100);
      final labelBg = RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(pos.dx, pos.dy - 20), width: tp.width + 10, height: tp.height + 6), const Radius.circular(4));
      canvas.drawRRect(labelBg, Paint()..color = const Color(0xCC1A1F36));
      tp.paint(canvas, Offset(pos.dx - tp.width / 2, pos.dy - 20 - tp.height / 2));
    }
  }

  void _drawDashedLine(Canvas canvas, Offset a, Offset b, Paint paint) {
    final dx = b.dx - a.dx, dy = b.dy - a.dy;
    final dist = sqrt(dx * dx + dy * dy);
    final ux = dx / dist, uy = dy / dist;
    double d = 0;
    while (d < dist) {
      final start = Offset(a.dx + ux * d, a.dy + uy * d);
      final end = Offset(a.dx + ux * (d + 6).clamp(0, dist), a.dy + uy * (d + 6).clamp(0, dist));
      canvas.drawLine(start, end, paint);
      d += 12;
    }
  }

  Color _placeColor(List<String> types) {
    if (types.any((t) => t.contains('restaurant') || t.contains('food'))) return AppTheme.secondary;
    if (types.any((t) => t.contains('museum') || t.contains('art'))) return AppTheme.accent;
    if (types.any((t) => t.contains('park') || t.contains('garden'))) return AppTheme.success;
    if (types.any((t) => t.contains('shopping'))) return AppTheme.warning;
    return AppTheme.primary;
  }

  @override bool shouldRepaint(covariant _MapPainter old) => true;
}

class _SelectedPlaceCard extends StatelessWidget {
  final Place place; final VoidCallback onClose; final VoidCallback onAdd;
  const _SelectedPlaceCard({required this.place, required this.onClose, required this.onAdd});
  @override Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16),
    child: TweenAnimationBuilder<double>(tween: Tween(begin: 0, end: 1), duration: const Duration(milliseconds: 350), curve: Curves.easeOutBack,
      builder: (_, v, c) => Transform.scale(scale: v, child: Opacity(opacity: v, child: c)),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Theme.of(context).cardColor, borderRadius: BorderRadius.circular(20), boxShadow: AppTheme.cardShadow),
        child: Row(children: [
          Container(width: 50, height: 50, decoration: BoxDecoration(gradient: AppTheme.primaryGradient, borderRadius: BorderRadius.circular(14)),
            child: Icon(_typeIcon(place.types), color: Colors.white, size: 22)),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(place.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
            if (place.address != null) Text(place.address!, style: TextStyle(color: Colors.grey[500], fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
            if (place.rating != null) Row(children: [const Icon(Icons.star, size: 14, color: AppTheme.gold), Text(' ${place.rating!.toStringAsFixed(1)}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12))]),
          ])),
          Column(children: [
            IconButton(icon: const Icon(Icons.close, size: 18), onPressed: onClose, visualDensity: VisualDensity.compact),
            IconButton(icon: const Icon(Icons.add_circle, color: AppTheme.primary), onPressed: onAdd, visualDensity: VisualDensity.compact),
          ]),
        ]),
      ),
    ),
  );
  IconData _typeIcon(List<String> types) {
    if (types.any((t) => t.contains('restaurant'))) return Icons.restaurant;
    if (types.any((t) => t.contains('museum'))) return Icons.museum;
    if (types.any((t) => t.contains('park'))) return Icons.park;
    if (types.any((t) => t.contains('shopping'))) return Icons.shopping_bag;
    return Icons.place;
  }
}

class _PlaceGridCard extends StatelessWidget {
  final Place place; final int index; final VoidCallback onTap;
  const _PlaceGridCard({required this.place, required this.index, required this.onTap});
  @override Widget build(BuildContext context) {
    final gradient = AppTheme.tripGradients[index % AppTheme.tripGradients.length];
    return TweenAnimationBuilder<double>(tween: Tween(begin: 0, end: 1), duration: Duration(milliseconds: 400 + index * 60), curve: Curves.easeOutCubic,
      builder: (_, v, c) => Transform.translate(offset: Offset(0, 20 * (1 - v)), child: Opacity(opacity: v, child: c)),
      child: GestureDetector(onTap: onTap, child: Container(
        decoration: BoxDecoration(color: Theme.of(context).cardColor, borderRadius: BorderRadius.circular(18), boxShadow: AppTheme.cardShadow),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(height: 90, decoration: BoxDecoration(gradient: gradient, borderRadius: const BorderRadius.vertical(top: Radius.circular(18))),
            child: Center(child: Icon(_typeIcon(place.types), color: Colors.white.withValues(alpha: 0.8), size: 36))),
          Padding(padding: const EdgeInsets.all(10), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(place.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 2),
            Text(place.address ?? place.types.join(', '), style: TextStyle(color: Colors.grey[500], fontSize: 11), maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            if (place.rating != null) Row(children: [
              ...List.generate(5, (i) => Icon(i < place.rating!.round() ? Icons.star : Icons.star_border, size: 12, color: AppTheme.gold)),
              Text(' ${place.rating!.toStringAsFixed(1)}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
            ]),
          ])),
        ]),
      )),
    );
  }
  IconData _typeIcon(List<String> types) {
    if (types.any((t) => t.contains('restaurant'))) return Icons.restaurant;
    if (types.any((t) => t.contains('museum'))) return Icons.museum;
    if (types.any((t) => t.contains('park'))) return Icons.park;
    if (types.any((t) => t.contains('shopping'))) return Icons.shopping_bag;
    if (types.any((t) => t.contains('temple') || t.contains('church'))) return Icons.temple_buddhist;
    return Icons.place;
  }
}
