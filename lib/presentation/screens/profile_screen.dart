import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/config/app_config.dart';
import '../../data/models/user_profile.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(currentUserProvider);
    final dark = ref.watch(darkModeProvider);
    final displayName = profile?.displayName ?? 'Traveler';
    final email = profile?.email ?? 'Set up your profile';
    return Scaffold(
      body: CustomScrollView(slivers: [
        SliverAppBar(expandedHeight: 200, pinned: true,
          flexibleSpace: FlexibleSpaceBar(
            background: Container(
              decoration: const BoxDecoration(gradient: AppTheme.primaryGradient),
              child: SafeArea(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                TweenAnimationBuilder<double>(tween: Tween(begin: 0, end: 1), duration: const Duration(milliseconds: 800), curve: Curves.elasticOut,
                  builder: (_, v, c) => Transform.scale(scale: v, child: c),
                  child: CircleAvatar(radius: 40, backgroundColor: Colors.white.withValues(alpha: 0.2),
                    child: Text(displayName.isNotEmpty ? displayName[0].toUpperCase() : 'T',
                      style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: Colors.white)))),
                const SizedBox(height: 10),
                Text(displayName, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                Text(email, style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 13)),
              ])),
            ),
          ),
        ),

        SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _sectionHeader(context, 'Settings', Icons.settings),
          const SizedBox(height: 8),
          _SettingsCard(children: [
            _toggle('Dark Mode', Icons.dark_mode, dark, (v) => ref.read(darkModeProvider.notifier).state = v),
            const Divider(height: 1),
            _tile('Edit Profile', Icons.person, () => _showProfileEdit(context, ref, profile)),
            const Divider(height: 1),
            _tile('Language', Icons.language, () {}, trailing: 'English'),
          ]),

          const SizedBox(height: 24),
          _sectionHeader(context, 'Travel Tools', Icons.build_circle),
          const SizedBox(height: 8),
          _SettingsCard(children: [
            _tile('Packing Checklist', Icons.checklist, () => _showChecklist(context)),
            const Divider(height: 1),
            _tile('Travel Tips', Icons.tips_and_updates, () => _showTips(context)),
            const Divider(height: 1),
            _tile('Emergency Contacts', Icons.sos, () => _showEmergency(context)),
          ]),

          const SizedBox(height: 24),
          _sectionHeader(context, 'Data', Icons.storage),
          const SizedBox(height: 8),
          _SettingsCard(children: [
            _tile('Clear All Data', Icons.delete_forever, () async {
              final confirm = await showDialog<bool>(context: context, builder: (ctx) => AlertDialog(
                title: const Text('Clear All Data?'), content: const Text('This will delete all trips and chat history.'),
                actions: [TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                  TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete', style: TextStyle(color: Colors.red)))],
              ));
              if (confirm == true) {
                ref.read(chatProvider.notifier).clear();
                ref.invalidate(tripsProvider);
                if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Data cleared')));
              }
            }, textColor: Colors.red),
          ]),

          const SizedBox(height: 24),
          _sectionHeader(context, 'About', Icons.info_outline),
          const SizedBox(height: 8),
          _SettingsCard(children: [
            _tile('Version', Icons.verified, () {}, trailing: AppConfig.appVersion),
            const Divider(height: 1),
            _tile('AI Model', Icons.auto_awesome, () {}, trailing: AppConfig.aiModel),
          ]),
          const SizedBox(height: 80),
        ]))),
      ]),
    );
  }

  Widget _sectionHeader(BuildContext context, String title, IconData icon) => Row(children: [
    Container(padding: const EdgeInsets.all(6), decoration: BoxDecoration(gradient: AppTheme.primaryGradient, borderRadius: BorderRadius.circular(8)),
      child: Icon(icon, color: Colors.white, size: 16)),
    const SizedBox(width: 10),
    Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
  ]);

  static Widget _toggle(String title, IconData icon, bool value, ValueChanged<bool> onChanged) => ListTile(
    leading: Icon(icon, color: AppTheme.primary), title: Text(title),
    trailing: Switch.adaptive(value: value, onChanged: onChanged, activeTrackColor: AppTheme.primary));

  static Widget _tile(String title, IconData icon, VoidCallback onTap, {String? trailing, Color? textColor}) => ListTile(
    leading: Icon(icon, color: textColor ?? AppTheme.primary), title: Text(title, style: TextStyle(color: textColor)),
    trailing: trailing != null ? Text(trailing, style: TextStyle(color: Colors.grey[500], fontSize: 13)) : const Icon(Icons.chevron_right, size: 20),
    onTap: onTap);

  void _showProfileEdit(BuildContext context, WidgetRef ref, UserProfile? profile) {
    final nameCtrl = TextEditingController(text: profile?.displayName ?? '');
    final emailCtrl = TextEditingController(text: profile?.email ?? '');
    showModalBottomSheet(context: context, isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 20, right: 20, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 20),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Center(child: Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)))),
          const SizedBox(height: 16),
          const Text('Edit Profile', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Name', prefixIcon: Icon(Icons.person))),
          const SizedBox(height: 12),
          TextField(controller: emailCtrl, decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.email))),
          const SizedBox(height: 20),
          SizedBox(width: double.infinity, child: ElevatedButton(
            onPressed: () {
              final now = DateTime.now();
              ref.read(currentUserProvider.notifier).state = UserProfile(
                id: profile?.id ?? now.millisecondsSinceEpoch.toString(),
                email: emailCtrl.text,
                displayName: nameCtrl.text,
                createdAt: profile?.createdAt ?? now,
                lastUpdated: now,
              );
              Navigator.pop(ctx);
            },
            child: const Text('Save'))),
        ])));
  }

  void _showChecklist(BuildContext context) {
    showModalBottomSheet(context: context, isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => const _ChecklistSheet());
  }

  void _showTips(BuildContext context) {
    final tips = [
      ('Always carry copies of important documents', Icons.description),
      ('Learn a few basic phrases in local language', Icons.translate),
      ('Keep emergency contacts saved offline', Icons.sos),
      ('Pack a portable phone charger', Icons.battery_charging_full),
      ('Register with your embassy before travel', Icons.account_balance),
      ('Get travel insurance', Icons.health_and_safety),
      ('Inform your bank about travel plans', Icons.credit_card),
      ('Download offline maps', Icons.map),
    ];
    showModalBottomSheet(context: context, isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => DraggableScrollableSheet(initialChildSize: 0.6, minChildSize: 0.3, maxChildSize: 0.9, expand: false,
        builder: (_, scroll) => ListView(controller: scroll, padding: const EdgeInsets.all(20), children: [
          Center(child: Container(width: 40, height: 4, margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)))),
          const Text('Travel Tips', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
          ...tips.asMap().entries.map((e) => TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: 1), duration: Duration(milliseconds: 300 + e.key * 60), curve: Curves.easeOutCubic,
            builder: (_, v, c) => Opacity(opacity: v, child: Transform.translate(offset: Offset(0, 12 * (1 - v)), child: c)),
            child: Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: AppTheme.primary.withValues(alpha: 0.04), borderRadius: BorderRadius.circular(14)),
              child: Row(children: [
                Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(
                  gradient: AppTheme.tripGradients[e.key % AppTheme.tripGradients.length], borderRadius: BorderRadius.circular(10)),
                  child: Icon(e.value.$2, color: Colors.white, size: 18)),
                const SizedBox(width: 12),
                Expanded(child: Text(e.value.$1, style: const TextStyle(fontSize: 13, height: 1.4))),
              ]),
            ),
          )),
        ])));
  }

  void _showEmergency(BuildContext context) {
    final contacts = [
      ('Police', '911', Icons.local_police, AppTheme.error),
      ('Ambulance', '911', Icons.emergency, AppTheme.secondary),
      ('Fire', '911', Icons.local_fire_department, AppTheme.warning),
      ('Embassy', '+1-202-555-0100', Icons.account_balance, AppTheme.primary),
    ];
    showModalBottomSheet(context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => Padding(padding: const EdgeInsets.all(20), child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2))),
        const SizedBox(height: 16),
        const Text('Emergency Contacts', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        ...contacts.map((c) => Container(
          margin: const EdgeInsets.only(bottom: 8),
          decoration: BoxDecoration(
            color: c.$4.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(14),
            border: Border.all(color: c.$4.withValues(alpha: 0.15))),
          child: ListTile(
            leading: Container(padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: c.$4.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10)),
              child: Icon(c.$3, color: c.$4, size: 20)),
            title: Text(c.$1, style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Text(c.$2),
            trailing: Container(padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: c.$4, borderRadius: BorderRadius.circular(10)),
              child: const Icon(Icons.call, color: Colors.white, size: 18)),
          ),
        )),
        const SizedBox(height: 8),
      ])));
  }
}

class _SettingsCard extends StatelessWidget {
  final List<Widget> children;
  const _SettingsCard({required this.children});
  @override Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(color: Theme.of(context).cardColor, borderRadius: BorderRadius.circular(16), boxShadow: AppTheme.cardShadow),
    clipBehavior: Clip.antiAlias, child: Column(children: children));
}

class _ChecklistSheet extends StatefulWidget {
  const _ChecklistSheet();
  @override State<_ChecklistSheet> createState() => _ChecklistSheetState();
}
class _ChecklistSheetState extends State<_ChecklistSheet> {
  final Map<String, bool> _items = {
    'Passport': false, 'Tickets': false, 'Hotel confirmation': false,
    'Travel insurance': false, 'Phone charger': false, 'Adapter': false,
    'Toiletries': false, 'Medications': false, 'Cash + Cards': false,
    'Comfortable shoes': false, 'Rain gear': false, 'Sunscreen': false,
    'Camera': false, 'Snacks': false, 'Water bottle': false,
  };
  @override Widget build(BuildContext context) => DraggableScrollableSheet(
    initialChildSize: 0.65, minChildSize: 0.3, maxChildSize: 0.9, expand: false,
    builder: (_, scroll) => ListView(controller: scroll, padding: const EdgeInsets.all(20), children: [
      Center(child: Container(width: 40, height: 4, margin: const EdgeInsets.only(bottom: 16),
        decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)))),
      Row(children: [
        const Text('Packing Checklist', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const Spacer(),
        Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(color: AppTheme.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
          child: Text('${_items.values.where((v) => v).length}/${_items.length}',
            style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primary, fontSize: 13))),
      ]),
      const SizedBox(height: 4),
      ClipRRect(borderRadius: BorderRadius.circular(4),
        child: LinearProgressIndicator(
          value: _items.values.where((v) => v).length / _items.length,
          backgroundColor: AppTheme.primary.withValues(alpha: 0.1), color: AppTheme.primary, minHeight: 6)),
      const SizedBox(height: 12),
      ..._items.entries.toList().asMap().entries.map((e) {
        final item = e.value;
        return TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: 1), duration: Duration(milliseconds: 250 + e.key * 40), curve: Curves.easeOutCubic,
          builder: (_, v, c) => Opacity(opacity: v, child: Transform.translate(offset: Offset(0, 8 * (1 - v)), child: c)),
          child: CheckboxListTile(
            value: item.value, title: Text(item.key,
              style: TextStyle(decoration: item.value ? TextDecoration.lineThrough : null, color: item.value ? Colors.grey : null)),
            onChanged: (v) => setState(() => _items[item.key] = v ?? false),
            activeColor: AppTheme.primary, controlAffinity: ListTileControlAffinity.leading,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
        );
      }),
    ]));
}
