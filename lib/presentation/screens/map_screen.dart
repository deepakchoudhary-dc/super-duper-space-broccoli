import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../providers/app_providers.dart';
import '../../data/models/place.dart';
import '../../core/theme/app_theme.dart';

class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});
  @override ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  final _searchCtrl = TextEditingController();
  GoogleMapController? _mapCtrl;
  List<Place> _places = [];
  bool _loading = false;
  bool _offline = false;
  int _selectedCat = 0;
  Place? _selectedPlace;
  Set<Marker> _markers = {};

  static const _initialPos = CameraPosition(target: LatLng(35.6762, 139.6503), zoom: 13);
  static const _cats = ['All', 'Food', 'Culture', 'Nature', 'Shopping'];
  static const _catIcons = [Icons.place, Icons.restaurant, Icons.museum, Icons.park, Icons.shopping_bag];
  static const _offlineCacheKey = 'offline_places_cache';

  @override
  void initState() {
    super.initState();
    _loadPlaces();
  }

  @override
  void dispose() {
    _mapCtrl?.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadPlaces() async {
    setState(() => _loading = true);
    try {
      final places = await ref.read(placesServiceProvider)
          .searchNearby(lat: 35.6762, lng: 139.6503, type: 'tourist_attraction');
      if (mounted) {
        setState(() { _places = places; _offline = false; _loading = false; _markers = _buildMarkers(places); });
      }
    } catch (_) {
      await _loadCachedPlaces();
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _search(String q) async {
    if (q.trim().isEmpty) { _loadPlaces(); return; }
    setState(() => _loading = true);
    try {
      final places = await ref.read(placesServiceProvider).searchByText(q);
      if (mounted) {
        setState(() { _places = places; _offline = false; _loading = false; _markers = _buildMarkers(places); });
        if (places.isNotEmpty) {
          _mapCtrl?.animateCamera(CameraUpdate.newLatLng(
            LatLng(places.first.latitude, places.first.longitude)));
        }
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Set<Marker> _buildMarkers(List<Place> places) {
    final markers = <Marker>{};
    for (final p in places) {
      markers.add(Marker(
        markerId: MarkerId(p.id),
        position: LatLng(p.latitude, p.longitude),
        infoWindow: InfoWindow(title: p.name, snippet: p.address),
        icon: BitmapDescriptor.defaultMarkerWithHue(_markerHue(p.types)),
        onTap: () {
          setState(() => _selectedPlace = p);
          _mapCtrl?.animateCamera(CameraUpdate.newLatLngZoom(
            LatLng(p.latitude, p.longitude), 15));
        },
      ));
    }
    return markers;
  }

  double _markerHue(List<String> types) {
    if (types.any((t) => t.contains('restaurant') || t.contains('food') || t.contains('cafe'))) return BitmapDescriptor.hueOrange;
    if (types.any((t) => t.contains('museum') || t.contains('art'))) return BitmapDescriptor.hueAzure;
    if (types.any((t) => t.contains('park') || t.contains('garden'))) return BitmapDescriptor.hueGreen;
    if (types.any((t) => t.contains('shopping'))) return BitmapDescriptor.hueYellow;
    return BitmapDescriptor.hueViolet;
  }

  List<Place> get _filtered {
    if (_selectedCat == 0) return _places;
    final keys = [[], ['restaurant','food','cafe'], ['museum','art','history','temple'], ['park','nature','garden'], ['shopping','market']][_selectedCat];
    return _places.where((p) => p.types.any((t) => keys.any((k) => t.contains(k)))).toList();
  }

  // ── Offline caching ────────────────────────────────────────────────────

  Future<void> _saveOffline() async {
    if (_places.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    final json = jsonEncode(_places.map((p) => p.toJson()).toList());
    await prefs.setString(_offlineCacheKey, json);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Map area saved for offline use'), backgroundColor: AppTheme.success),
      );
    }
  }

  Future<void> _loadCachedPlaces() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_offlineCacheKey);
    if (raw != null) {
      try {
        final list = (jsonDecode(raw) as List).map((j) => Place.fromJson(j as Map<String, dynamic>)).toList();
        if (mounted) {
          setState(() { _places = list; _offline = true; _markers = _buildMarkers(list); });
        }
      } catch (_) {}
    }
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
              child: SafeArea(child: Padding(
                padding: const EdgeInsets.only(top: 12, left: 20, right: 16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.end, children: [
                  Row(children: [
                    const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Explore', style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
                      SizedBox(height: 4),
                      Text('Discover amazing places nearby', style: TextStyle(color: Colors.white70, fontSize: 13)),
                    ])),
                    if (_offline) Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(color: AppTheme.warning.withValues(alpha: 0.9), borderRadius: BorderRadius.circular(20)),
                      child: const Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.offline_bolt, color: Colors.white, size: 14),
                        SizedBox(width: 4),
                        Text('Offline', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                      ]),
                    ),
                  ]),
                  const SizedBox(height: 16),
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
            onSelected: (_) {
              setState(() { _selectedCat = i; _markers = _buildMarkers(_filtered); });
            },
          )),
        ))),

        // Google Map
        SliverToBoxAdapter(child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: SizedBox(
              height: 280,
              child: Stack(children: [
                GoogleMap(
                  initialCameraPosition: _initialPos,
                  markers: _markers,
                  myLocationButtonEnabled: false,
                  zoomControlsEnabled: true,
                  mapType: MapType.normal,
                  onMapCreated: (ctrl) { _mapCtrl = ctrl; },
                  onTap: (_) => setState(() => _selectedPlace = null),
                ),
                // Save offline button
                Positioned(
                  top: 10, right: 10,
                  child: FloatingActionButton.small(
                    heroTag: 'save_offline',
                    tooltip: 'Save map area for offline use',
                    backgroundColor: Colors.white,
                    onPressed: _saveOffline,
                    child: const Icon(Icons.download_for_offline, color: AppTheme.primary),
                  ),
                ),
                if (_loading) const Positioned.fill(child: ColoredBox(
                  color: Colors.black26,
                  child: Center(child: CircularProgressIndicator()),
                )),
              ]),
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
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
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
                  (_, i) => _PlaceGridCard(
                    place: filtered[i], index: i,
                    onTap: () {
                      setState(() => _selectedPlace = filtered[i]);
                      _mapCtrl?.animateCamera(CameraUpdate.newLatLngZoom(
                        LatLng(filtered[i].latitude, filtered[i].longitude), 15));
                    },
                  ),
                  childCount: filtered.length,
                ),
              ),
            ),

        const SliverToBoxAdapter(child: SizedBox(height: 100)),
      ]),
    );
  }
}

class _SelectedPlaceCard extends StatelessWidget {
  final Place place; final VoidCallback onClose; final VoidCallback onAdd;
  const _SelectedPlaceCard({required this.place, required this.onClose, required this.onAdd});
  @override Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
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

