import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import '../providers/app_providers.dart';
import '../../data/models/place.dart';
import '../../core/theme/app_theme.dart';

class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});
  @override ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  final _searchCtrl = TextEditingController();
  GoogleMapController? _mapController;
  List<Place> _places = [];
  List<Place> _savedPlaces = [];
  bool _loading = false;
  bool _showOfflineBanner = false;
  int _selectedCat = 0;
  Place? _selectedPlace;
  Set<Marker> _markers = {};

  static const _initialPosition = CameraPosition(
    target: LatLng(35.6762, 139.6503),
    zoom: 13,
  );

  static const _cats = ['All', 'Food', 'Culture', 'Nature', 'Shopping'];
  static const _catIcons = [Icons.place, Icons.restaurant, Icons.museum, Icons.park, Icons.shopping_bag];
  static const _fabBottomDefault = 110.0;
  static const _fabBottomWithCard = 220.0;

  @override
  void initState() {
    super.initState();
    _loadSavedPlaces();
    _loadPlaces();
  }

  @override
  void dispose() {
    _mapController?.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadSavedPlaces() async {
    final saved = await ref.read(offlineMapServiceProvider).getSavedPlaces();
    if (mounted) { setState(() => _savedPlaces = saved); _updateMarkers(); }
  }

  Future<void> _loadPlaces() async {
    setState(() => _loading = true);
    try {
      final places = await ref.read(placesServiceProvider)
          .searchNearby(lat: 35.6762, lng: 139.6503, type: 'tourist_attraction');
      if (mounted) { setState(() { _places = places; _loading = false; }); _updateMarkers(); }
    } catch (_) {
      if (mounted) setState(() { _loading = false; _showOfflineBanner = true; });
    }
  }

  Future<void> _search(String q) async {
    if (q.trim().isEmpty) { _loadPlaces(); return; }
    setState(() => _loading = true);
    try {
      final places = await ref.read(placesServiceProvider).searchByText(q);
      if (mounted) {
        setState(() { _places = places; _loading = false; });
        _updateMarkers();
        if (places.isNotEmpty && _mapController != null) {
          _mapController!.animateCamera(
              CameraUpdate.newLatLng(LatLng(places.first.latitude, places.first.longitude)));
        }
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _updateMarkers() {
    final allPlaces = [..._filtered, ..._savedPlaces.where((s) => !_filtered.any((f) => f.id == s.id))];
    final markers = <Marker>{};
    for (final place in allPlaces) {
      final isSaved = _savedPlaces.any((s) => s.id == place.id);
      markers.add(Marker(
        markerId: MarkerId(place.id),
        position: LatLng(place.latitude, place.longitude),
        infoWindow: InfoWindow(
          title: place.name,
          snippet: place.address ?? place.types.join(', '),
          onTap: () => setState(() => _selectedPlace = place),
        ),
        icon: BitmapDescriptor.defaultMarkerWithHue(
            isSaved ? BitmapDescriptor.hueGreen : _placeHue(place.types)),
        onTap: () => setState(() => _selectedPlace = place),
      ));
    }
    setState(() => _markers = markers);
  }

  double _placeHue(List<String> types) {
    if (types.any((t) => t.contains('restaurant') || t.contains('food'))) return BitmapDescriptor.hueOrange;
    if (types.any((t) => t.contains('museum') || t.contains('art'))) return BitmapDescriptor.hueBlue;
    if (types.any((t) => t.contains('park') || t.contains('garden'))) return BitmapDescriptor.hueGreen;
    if (types.any((t) => t.contains('shopping'))) return BitmapDescriptor.hueYellow;
    return BitmapDescriptor.hueViolet;
  }

  List<Place> get _filtered {
    if (_selectedCat == 0) return _places;
    final keys = [[], ['restaurant','food','cafe'], ['museum','art','history','temple'], ['park','nature','garden'], ['shopping','market']][_selectedCat];
    return _places.where((p) => p.types.any((t) => keys.any((k) => t.contains(k)))).toList();
  }

  Future<void> _downloadOffline() async {
    setState(() => _loading = true);
    await ref.read(offlineMapServiceProvider).savePlaces(_places);
    if (mounted) {
      setState(() { _loading = false; _savedPlaces = List.from(_places); });
      _updateMarkers();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('${_places.length} places saved for offline use'),
        backgroundColor: AppTheme.success,
      ));
    }
  }

  void _showAddPlaceDialog([LatLng? position]) {
    final nameCtrl = TextEditingController();
    final addrCtrl = TextEditingController();
    String selectedType = 'tourist_attraction';
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      builder: (_) => StatefulBuilder(builder: (ctx, setBS) => Padding(
        padding: EdgeInsets.only(
            bottom: MediaQuery.of(ctx).viewInsets.bottom, left: 20, right: 20, top: 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Center(child: Container(width: 40, height: 4,
              decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)))),
          const SizedBox(height: 16),
          const Text('Add Place to Map', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          TextField(controller: nameCtrl,
              decoration: const InputDecoration(labelText: 'Place Name', prefixIcon: Icon(Icons.place))),
          const SizedBox(height: 12),
          TextField(controller: addrCtrl,
              decoration: const InputDecoration(labelText: 'Address (optional)', prefixIcon: Icon(Icons.location_on))),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: selectedType,
            decoration: const InputDecoration(labelText: 'Type', prefixIcon: Icon(Icons.category)),
            items: const [
              DropdownMenuItem(value: 'tourist_attraction', child: Text('Tourist Attraction')),
              DropdownMenuItem(value: 'restaurant', child: Text('Food & Dining')),
              DropdownMenuItem(value: 'museum', child: Text('Museum / Culture')),
              DropdownMenuItem(value: 'park', child: Text('Park / Nature')),
              DropdownMenuItem(value: 'shopping', child: Text('Shopping')),
            ],
            onChanged: (v) => setBS(() => selectedType = v ?? selectedType),
          ),
          const SizedBox(height: 20),
          SizedBox(width: double.infinity, child: ElevatedButton.icon(
            icon: const Icon(Icons.add_location_alt),
            label: const Text('Add Place'),
            onPressed: () async {
              if (nameCtrl.text.trim().isEmpty) return;
              final newPlace = Place(
                id: 'custom_${DateTime.now().millisecondsSinceEpoch}',
                name: nameCtrl.text.trim(),
                latitude: position?.latitude ?? 35.6762,
                longitude: position?.longitude ?? 139.6503,
                address: addrCtrl.text.trim().isEmpty ? null : addrCtrl.text.trim(),
                types: [selectedType],
              );
              final offlineSvc = ref.read(offlineMapServiceProvider);
              final saved = await offlineSvc.getSavedPlaces();
              await offlineSvc.savePlaces([...saved, newPlace]);
              if (mounted) {
                setState(() { _savedPlaces = [..._savedPlaces, newPlace]; });
                _updateMarkers();
                if (_mapController != null) {
                  _mapController!.animateCamera(
                      CameraUpdate.newLatLng(LatLng(newPlace.latitude, newPlace.longitude)));
                }
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: Text('${newPlace.name} added to map'),
                  backgroundColor: AppTheme.primary,
                ));
              }
            },
          )),
          const SizedBox(height: 20),
        ]),
      )),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(children: [

        // ── Google Map ──────────────────────────────────────────────────────
        GoogleMap(
          initialCameraPosition: _initialPosition,
          markers: _markers,
          myLocationButtonEnabled: true,
          zoomControlsEnabled: false,
          mapToolbarEnabled: false,
          onMapCreated: (controller) {
            _mapController = controller;
            _updateMarkers();
          },
          onLongPress: (latlng) => _showAddPlaceDialog(latlng),
        ),

        // ── Offline banner ──────────────────────────────────────────────────
        if (_showOfflineBanner) Positioned(
          top: 0, left: 0, right: 0,
          child: SafeArea(child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
                color: AppTheme.warning.withValues(alpha: 0.95),
                borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              const Icon(Icons.offline_bolt, color: Colors.white, size: 18),
              const SizedBox(width: 8),
              const Expanded(child: Text('Offline mode – showing saved places',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12))),
              IconButton(icon: const Icon(Icons.close, color: Colors.white, size: 16),
                  onPressed: () => setState(() => _showOfflineBanner = false),
                  visualDensity: VisualDensity.compact),
            ]),
          )),
        ),

        // ── Search bar + category chips overlay ────────────────────────────
        Positioned(
          top: _showOfflineBanner ? 72 : 0,
          left: 0, right: 0,
          child: SafeArea(child: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Material(
                elevation: 4,
                borderRadius: BorderRadius.circular(20),
                child: TextField(
                  controller: _searchCtrl,
                  decoration: InputDecoration(
                    hintText: 'Search places, attractions...',
                    prefixIcon: _loading
                        ? const Padding(padding: EdgeInsets.all(12),
                            child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)))
                        : const Icon(Icons.search),
                    suffixIcon: _searchCtrl.text.isNotEmpty
                        ? IconButton(icon: const Icon(Icons.clear),
                            onPressed: () { _searchCtrl.clear(); _loadPlaces(); })
                        : null,
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(20), borderSide: BorderSide.none),
                    filled: true,
                    fillColor: Colors.white,
                  ),
                  onSubmitted: _search,
                  onChanged: (v) => setState(() {}),
                ),
              ),
            ),
            SizedBox(height: 42, child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              itemCount: _cats.length,
              itemBuilder: (_, i) => Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: ChoiceChip(
                  avatar: Icon(_catIcons[i], size: 16,
                      color: _selectedCat == i ? Colors.white : AppTheme.primary),
                  label: Text(_cats[i],
                      style: TextStyle(color: _selectedCat == i ? Colors.white : null,
                          fontWeight: FontWeight.w600, fontSize: 12)),
                  selected: _selectedCat == i,
                  selectedColor: AppTheme.primary,
                  backgroundColor: Colors.white,
                  onSelected: (_) { setState(() => _selectedCat = i); _updateMarkers(); },
                ),
              ),
            )),
          ])),
        ),

        // ── Download offline button ─────────────────────────────────────────
        Positioned(
          right: 16,
          bottom: _selectedPlace != null ? _fabBottomWithCard : _fabBottomDefault,
          child: FloatingActionButton.small(
            heroTag: 'download_offline',
            backgroundColor: Colors.white,
            foregroundColor: AppTheme.primary,
            onPressed: _downloadOffline,
            tooltip: 'Download current places for offline use',
            child: const Icon(Icons.download_for_offline),
          ),
        ),

        // ── Selected place card ─────────────────────────────────────────────
        if (_selectedPlace != null) Positioned(
          bottom: 90, left: 16, right: 16,
          child: _SelectedPlaceCard(
            place: _selectedPlace!,
            isSaved: _savedPlaces.any((s) => s.id == _selectedPlace!.id),
            onClose: () => setState(() => _selectedPlace = null),
            onSave: () async {
              final place = _selectedPlace!;
              final offlineSvc = ref.read(offlineMapServiceProvider);
              final saved = await offlineSvc.getSavedPlaces();
              if (!saved.any((s) => s.id == place.id)) {
                await offlineSvc.savePlaces([...saved, place]);
                if (mounted) {
                  setState(() { _savedPlaces = [..._savedPlaces, place]; });
                  _updateMarkers();
                }
              }
              if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content: Text('${place.name} saved for offline'),
                backgroundColor: AppTheme.primary,
              ));
            },
          ),
        ),
      ]),

      // ── FAB: Add place ────────────────────────────────────────────────────
      floatingActionButton: FloatingActionButton(
        heroTag: 'add_place',
        onPressed: () => _showAddPlaceDialog(),
        tooltip: 'Add a place to the map',
        child: const Icon(Icons.add_location_alt),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Selected Place Card
// ─────────────────────────────────────────────────────────────────────────────

class _SelectedPlaceCard extends StatelessWidget {
  final Place place;
  final bool isSaved;
  final VoidCallback onClose;
  final VoidCallback onSave;

  const _SelectedPlaceCard({
    required this.place,
    required this.isSaved,
    required this.onClose,
    required this.onSave,
  });

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
    tween: Tween(begin: 0, end: 1),
    duration: const Duration(milliseconds: 350),
    curve: Curves.easeOutBack,
    builder: (_, v, c) => Transform.scale(scale: v, child: Opacity(opacity: v, child: c)),
    child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(20),
          boxShadow: AppTheme.cardShadow),
      child: Row(children: [
        Container(
          width: 50, height: 50,
          decoration: BoxDecoration(gradient: AppTheme.primaryGradient, borderRadius: BorderRadius.circular(14)),
          child: Icon(_typeIcon(place.types), color: Colors.white, size: 22),
        ),
        const SizedBox(width: 14),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(place.name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
          if (place.address != null)
            Text(place.address!, style: TextStyle(color: Colors.grey[500], fontSize: 12),
                maxLines: 1, overflow: TextOverflow.ellipsis),
          if (place.rating != null)
            Row(children: [
              const Icon(Icons.star, size: 14, color: AppTheme.gold),
              Text(' ${place.rating!.toStringAsFixed(1)}',
                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
            ]),
        ])),
        Column(children: [
          IconButton(icon: const Icon(Icons.close, size: 18), onPressed: onClose,
              visualDensity: VisualDensity.compact),
          IconButton(
            icon: Icon(isSaved ? Icons.bookmark : Icons.bookmark_add_outlined,
                color: isSaved ? AppTheme.success : AppTheme.primary),
            onPressed: onSave,
            visualDensity: VisualDensity.compact,
            tooltip: isSaved ? 'Already saved offline' : 'Save for offline',
          ),
        ]),
      ]),
    ),
  );

  IconData _typeIcon(List<String> types) {
    if (types.any((t) => t.contains('restaurant'))) return Icons.restaurant;
    if (types.any((t) => t.contains('museum'))) return Icons.museum;
    if (types.any((t) => t.contains('park'))) return Icons.park;
    if (types.any((t) => t.contains('shopping'))) return Icons.shopping_bag;
    if (types.any((t) => t.contains('temple') || t.contains('church'))) return Icons.temple_buddhist;
    return Icons.place;
  }
}

