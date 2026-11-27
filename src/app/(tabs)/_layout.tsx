import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import type { IconName } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color as string} size={size} />;

export default function TabsLayout() {
  const c = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.charge'), tabBarIcon: icon('flash') }} />
      <Tabs.Screen name="discover" options={{ title: t('tabs.discover'), tabBarIcon: icon('people') }} />
      <Tabs.Screen name="matches" options={{ title: t('tabs.matches'), tabBarIcon: icon('chatbubbles') }} />
      <Tabs.Screen name="vehicles" options={{ title: t('tabs.vehicles'), tabBarIcon: icon('car-sport') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon('person-circle') }} />
    </Tabs>
  );
}
