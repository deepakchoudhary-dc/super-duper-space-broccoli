import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/app_theme.dart';
import 'presentation/providers/app_providers.dart';
import 'presentation/screens/home_screen.dart';
import 'presentation/screens/trips_screen.dart';
import 'presentation/screens/map_screen.dart';
import 'presentation/screens/chat_screen.dart';
import 'presentation/screens/profile_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: TravelCompanionApp()));
}

class TravelCompanionApp extends ConsumerWidget {
  const TravelCompanionApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final darkMode = ref.watch(darkModeProvider);
    return MaterialApp(
      title: 'Travel Companion',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: darkMode ? ThemeMode.dark : ThemeMode.light,
      home: const _MainShell(),
    );
  }
}

/// 0=Home, 1=Trips, 2=Explore, 3=AI, 4=Profile
class _MainShell extends ConsumerWidget {
  const _MainShell();

  static const _screens = <Widget>[
    HomeScreen(), TripsScreen(), MapScreen(), ChatScreen(), ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final idx = ref.watch(bottomNavIndexProvider);
    return Scaffold(
      body: IndexedStack(index: idx, children: _screens),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 20, offset: const Offset(0, -4))],
        ),
        child: NavigationBar(
          selectedIndex: idx,
          onDestinationSelected: (i) => ref.read(bottomNavIndexProvider.notifier).state = i,
          animationDuration: const Duration(milliseconds: 500),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.flight_outlined), selectedIcon: Icon(Icons.flight), label: 'Trips'),
            NavigationDestination(icon: Icon(Icons.explore_outlined), selectedIcon: Icon(Icons.explore), label: 'Explore'),
            NavigationDestination(icon: Icon(Icons.auto_awesome_outlined), selectedIcon: Icon(Icons.auto_awesome), label: 'AI'),
            NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
          ],
        ),
      ),
    );
  }
}
