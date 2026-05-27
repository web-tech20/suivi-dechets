import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Trash2 } from 'lucide-react-native';

export default function BinMarker({ fillLevel }) {
  const getColor = () => {
    if (fillLevel >= 80) return '#ef4444'; // Red
    if (fillLevel >= 50) return '#f59e0b'; // Orange
    return '#10b981'; // Green
  };

  return (
    <View style={styles.container}>
      <View style={[styles.bubble, { backgroundColor: getColor() }]}>
        <Trash2 color="white" size={16} />
      </View>
      <View style={[styles.arrow, { borderTopColor: getColor() }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -2,
  }
});
