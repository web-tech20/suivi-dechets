import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { Bell } from 'lucide-react-native';

export default function NotificationCard({ title, body, date }) {
  return (
    <Surface style={styles.card} elevation={2}>
      <View style={styles.iconContainer}>
        <Bell color="#10b981" size={24} />
      </View>
      <View style={styles.content}>
        <Text variant="titleSmall" style={styles.title}>{title}</Text>
        <Text variant="bodyMedium" style={styles.body}>{body}</Text>
        <Text variant="labelSmall" style={styles.date}>{date}</Text>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#10b981'
  },
  iconContainer: {
    marginRight: 16,
    justifyContent: 'center'
  },
  content: {
    flex: 1
  },
  title: {
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 4
  },
  body: {
    color: '#94a3b8',
    marginBottom: 8
  },
  date: {
    color: '#64748b'
  }
});
