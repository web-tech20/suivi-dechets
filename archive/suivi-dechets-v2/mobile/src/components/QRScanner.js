import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { Camera, CameraType } from 'react-native-camera-kit'; // Note: Requires actual device for testing

export default function QRScanner({ onScan, onCancel }) {
  return (
    <View style={styles.container}>
      <Camera
        style={styles.camera}
        cameraType={CameraType.Back}
        scanBarcode={true}
        onReadCode={(event) => onScan(event.nativeEvent.codeStringValue)}
        showFrame={true}
        laserColor='red'
        frameColor='white'
      />
      <View style={styles.overlay}>
        <Text style={styles.instruction}>Centrez le QR Code dans le cadre</Text>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  camera: { flex: 1 },
  overlay: { 
    position: 'absolute', 
    bottom: 50, left: 0, right: 0, 
    alignItems: 'center' 
  },
  instruction: { 
    color: 'white', 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    padding: 10, borderRadius: 8, 
    marginBottom: 20 
  },
  cancelBtn: { 
    backgroundColor: '#ef4444', 
    paddingHorizontal: 30, paddingVertical: 12, 
    borderRadius: 8 
  },
  cancelText: { color: 'white', fontWeight: 'bold' }
});
