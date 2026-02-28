import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/app_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/chat_message.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});
  @override ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> with SingleTickerProviderStateMixin {
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  bool _sending = false;
  late AnimationController _typingAnim;

  static const _suggestions = [
    'Best restaurants in Tokyo',
    'Create a 3-day Paris itinerary',
    'Budget tips for Europe',
    'Must-visit temples in Bali',
    'Travel safety tips for solo travelers',
  ];

  @override void initState() {
    super.initState();
    _typingAnim = AnimationController(vsync: this, duration: const Duration(milliseconds: 800))..repeat(reverse: true);
  }
  @override void dispose() { _ctrl.dispose(); _scroll.dispose(); _typingAnim.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final msgs = ref.watch(chatProvider);
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          Container(padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(gradient: AppTheme.primaryGradient, borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.auto_awesome, color: Colors.white, size: 20)),
          const SizedBox(width: 10),
          const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('AI Travel Assistant', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold)),
            Text('Powered by AI', style: TextStyle(fontSize: 11, color: Colors.grey)),
          ]),
        ]),
        actions: [IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => ref.read(chatProvider.notifier).clear())],
      ),
      body: Column(children: [
        Expanded(child: msgs.isEmpty ? _buildEmpty() : _buildMessages(msgs)),
        if (_sending) _buildTyping(),
        _buildInput(),
      ]),
    );
  }

  Widget _buildEmpty() => Center(child: SingleChildScrollView(
    padding: const EdgeInsets.all(24),
    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      TweenAnimationBuilder<double>(tween: Tween(begin: 0, end: 1), duration: const Duration(seconds: 1), curve: Curves.elasticOut,
        builder: (_, v, c) => Transform.scale(scale: v, child: c),
        child: Container(padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(gradient: AppTheme.primaryGradient, shape: BoxShape.circle,
            boxShadow: [BoxShadow(color: AppTheme.primary.withValues(alpha: 0.3), blurRadius: 30, offset: const Offset(0, 10))]),
          child: const Icon(Icons.auto_awesome, color: Colors.white, size: 48))),
      const SizedBox(height: 24),
      const Text('Your AI Travel Expert', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
      const SizedBox(height: 8),
      Text('Ask anything about travel \u2014 destinations, planning, budgets, culture, and more!',
        style: TextStyle(color: Colors.grey[500], fontSize: 14), textAlign: TextAlign.center),
      const SizedBox(height: 28),
      Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.center,
        children: _suggestions.asMap().entries.map((e) => TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: 1), duration: Duration(milliseconds: 500 + e.key * 100), curve: Curves.easeOutCubic,
          builder: (_, v, c) => Opacity(opacity: v, child: Transform.translate(offset: Offset(0, 12 * (1 - v)), child: c)),
          child: ActionChip(
            avatar: const Icon(Icons.arrow_forward_ios, size: 12),
            label: Text(e.value, style: const TextStyle(fontSize: 12)),
            onPressed: () { _ctrl.text = e.value; _send(); },
          ),
        )).toList()),
    ]),
  ));

  Widget _buildMessages(List<ChatMessage> msgs) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
    });
    return ListView.builder(
      controller: _scroll, padding: const EdgeInsets.all(16), itemCount: msgs.length,
      itemBuilder: (_, i) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1), duration: const Duration(milliseconds: 350), curve: Curves.easeOutCubic,
        builder: (_, v, c) => Opacity(opacity: v, child: Transform.translate(offset: Offset(0, 10 * (1 - v)), child: c)),
        child: _MessageBubble(msg: msgs[i]),
      ),
    );
  }

  Widget _buildTyping() => Padding(
    padding: const EdgeInsets.only(left: 16, bottom: 4),
    child: Row(children: [
      Container(padding: const EdgeInsets.all(6), decoration: BoxDecoration(gradient: AppTheme.primaryGradient, shape: BoxShape.circle),
        child: const Icon(Icons.auto_awesome, color: Colors.white, size: 14)),
      const SizedBox(width: 8),
      AnimatedBuilder(animation: _typingAnim, builder: (_, __) => Row(mainAxisSize: MainAxisSize.min,
        children: List.generate(3, (i) => Container(
          margin: const EdgeInsets.symmetric(horizontal: 2),
          width: 6, height: 6,
          decoration: BoxDecoration(
            color: AppTheme.primary.withValues(alpha: 0.3 + (0.5 * ((i == 0 ? _typingAnim.value : i == 1 ? (_typingAnim.value - 0.15).clamp(0, 1) : (_typingAnim.value - 0.3).clamp(0, 1))))),
            shape: BoxShape.circle),
        )),
      )),
    ]),
  );

  Widget _buildInput() => Container(
    padding: EdgeInsets.only(left: 12, right: 8, top: 8, bottom: MediaQuery.of(context).padding.bottom + 8),
    decoration: BoxDecoration(color: Theme.of(context).scaffoldBackgroundColor,
      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10, offset: const Offset(0, -3))]),
    child: Row(children: [
      Expanded(child: Container(
        decoration: BoxDecoration(color: Theme.of(context).cardColor, borderRadius: BorderRadius.circular(24), boxShadow: AppTheme.cardShadow),
        child: TextField(controller: _ctrl, onSubmitted: (_) => _send(),
          decoration: InputDecoration(hintText: 'Ask about travel...', border: InputBorder.none,
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            filled: false, enabledBorder: InputBorder.none, focusedBorder: InputBorder.none)),
      )),
      const SizedBox(width: 8),
      Container(decoration: const BoxDecoration(gradient: AppTheme.primaryGradient, shape: BoxShape.circle),
        child: IconButton(icon: const Icon(Icons.send_rounded, color: Colors.white), onPressed: _sending ? null : _send)),
    ]),
  );

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty) return;
    _ctrl.clear();
    setState(() => _sending = true);
    try { await ref.read(chatProvider.notifier).send(text); } catch (_) {}
    if (mounted) setState(() => _sending = false);
  }
}

class _MessageBubble extends StatelessWidget {
  final ChatMessage msg;
  const _MessageBubble({required this.msg});
  @override Widget build(BuildContext context) {
    final isUser = msg.role == MessageRole.user;
    return Padding(padding: const EdgeInsets.only(bottom: 12), child: Row(
      mainAxisAlignment: isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (!isUser) ...[
          Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(gradient: AppTheme.primaryGradient, shape: BoxShape.circle),
            child: const Icon(Icons.auto_awesome, color: Colors.white, size: 16)),
          const SizedBox(width: 8),
        ],
        Flexible(child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            gradient: isUser ? AppTheme.primaryGradient : null,
            color: isUser ? null : Theme.of(context).cardColor,
            borderRadius: BorderRadius.only(
              topLeft: const Radius.circular(20), topRight: const Radius.circular(20),
              bottomLeft: Radius.circular(isUser ? 20 : 4), bottomRight: Radius.circular(isUser ? 4 : 20)),
            boxShadow: isUser ? null : AppTheme.cardShadow,
          ),
          child: Text(msg.content, style: TextStyle(color: isUser ? Colors.white : null, fontSize: 14, height: 1.5)),
        )),
      ],
    ));
  }
}
