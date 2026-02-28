import 'package:flutter/material.dart';

class AppTheme {
  AppTheme._();

  // Brand Colors
  static const Color primary = Color(0xFF6C63FF);
  static const Color primaryDark = Color(0xFF3F3D9E);
  static const Color secondary = Color(0xFFFF6B6B);
  static const Color accent = Color(0xFF00D2FF);
  static const Color accent2 = Color(0xFF36D1DC);
  static const Color gold = Color(0xFFFFD700);
  static const Color success = Color(0xFF00E676);
  static const Color warning = Color(0xFFFFAB00);
  static const Color error = Color(0xFFFF5252);
  static const Color surface = Color(0xFFF8F9FE);
  static const Color surfaceDark = Color(0xFF0A0E21);
  static const Color cardLight = Colors.white;
  static const Color cardDark = Color(0xFF1A1F36);

  // Gradients
  static const primaryGradient = LinearGradient(
    colors: [Color(0xFF6C63FF), Color(0xFF3F8CFF)],
    begin: Alignment.topLeft, end: Alignment.bottomRight,
  );
  static const sunsetGradient = LinearGradient(
    colors: [Color(0xFFFF6B6B), Color(0xFFFF8E53)],
    begin: Alignment.topLeft, end: Alignment.bottomRight,
  );
  static const oceanGradient = LinearGradient(
    colors: [Color(0xFF36D1DC), Color(0xFF5B86E5)],
    begin: Alignment.topLeft, end: Alignment.bottomRight,
  );
  static const nightGradient = LinearGradient(
    colors: [Color(0xFF0A0E21), Color(0xFF1A1F36), Color(0xFF2D325A)],
    begin: Alignment.topCenter, end: Alignment.bottomCenter,
  );
  static const emeraldGradient = LinearGradient(
    colors: [Color(0xFF00B09B), Color(0xFF96C93D)],
    begin: Alignment.topLeft, end: Alignment.bottomRight,
  );

  static const List<LinearGradient> tripGradients = [
    primaryGradient, sunsetGradient, oceanGradient, emeraldGradient,
    LinearGradient(colors: [Color(0xFFA18CD1), Color(0xFFFBC2EB)], begin: Alignment.topLeft, end: Alignment.bottomRight),
    LinearGradient(colors: [Color(0xFF667EEA), Color(0xFF764BA2)], begin: Alignment.topLeft, end: Alignment.bottomRight),
  ];

  static List<BoxShadow> get softShadow => [
    BoxShadow(color: primary.withValues(alpha: 0.08), blurRadius: 24, offset: const Offset(0, 8)),
  ];
  static List<BoxShadow> get cardShadow => [
    BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 16, offset: const Offset(0, 4)),
  ];

  static BoxDecoration glassDecoration({Color? color, double opacity = 0.12, double radius = 20}) => BoxDecoration(
    color: (color ?? Colors.white).withValues(alpha: opacity),
    borderRadius: BorderRadius.circular(radius),
    border: Border.all(color: Colors.white.withValues(alpha: 0.2), width: 1.5),
  );

  static final light = ThemeData(
    useMaterial3: true, brightness: Brightness.light, colorSchemeSeed: primary,
    scaffoldBackgroundColor: surface,
    textTheme: ThemeData.light().textTheme,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent, elevation: 0, scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(color: Color(0xFF1A1B4B), fontSize: 22, fontWeight: FontWeight.bold),
      iconTheme: IconThemeData(color: Color(0xFF1A1B4B)),
    ),
    cardTheme: CardThemeData(elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)), color: cardLight),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white, elevation: 0, indicatorColor: primary.withValues(alpha: 0.12), height: 70,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true, fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: Colors.grey.withValues(alpha: 0.15))),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: Colors.grey.withValues(alpha: 0.15))),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: primary, width: 2)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(style: ElevatedButton.styleFrom(
      backgroundColor: primary, foregroundColor: Colors.white, elevation: 0,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
    )),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(backgroundColor: primary, foregroundColor: Colors.white, elevation: 8),
  );

  static final dark = ThemeData(
    useMaterial3: true, brightness: Brightness.dark, colorSchemeSeed: primary,
    scaffoldBackgroundColor: surfaceDark,
    textTheme: ThemeData.dark().textTheme,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent, elevation: 0, scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
      iconTheme: IconThemeData(color: Colors.white),
    ),
    cardTheme: CardThemeData(elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)), color: cardDark),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: const Color(0xFF0E1229), elevation: 0, indicatorColor: primary.withValues(alpha: 0.2), height: 70,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true, fillColor: cardDark,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.1))),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.1))),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: primary, width: 2)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(style: ElevatedButton.styleFrom(
      backgroundColor: primary, foregroundColor: Colors.white, elevation: 0,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      textStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
    )),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(backgroundColor: primary, foregroundColor: Colors.white, elevation: 8),
  );
}
