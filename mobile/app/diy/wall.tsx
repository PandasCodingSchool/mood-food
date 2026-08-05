import { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StatusBar, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { fw, colors } from '../../src/constants/theme';
import { uploadWallPhoto } from '../../src/services/diy';

export default function DiyWallScreen() {
  const router = useRouter();
  const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();
  const params = useLocalSearchParams<{ sessionId: string; dishName: string }>();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'locked' | 'rejected' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setMessage('Camera access is needed to add a photo to your wall.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      base64: true,
      quality: 0.7,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;

    const asset = result.assets[0];
    setPhotoUri(asset.uri);
    setStatus('uploading');
    setMessage(null);

    const upload = await uploadWallPhoto(params.sessionId, asset.base64!, asset.mimeType || 'image/jpeg');
    if (upload.rejected) {
      setStatus('rejected');
      setMessage(upload.reason || "That doesn't look like food — try another photo.");
    } else if (upload.locked) {
      setStatus('locked');
      setMessage(null);
    } else if (!upload.success) {
      setStatus('error');
      setMessage(upload.error || 'Could not upload your photo.');
    } else {
      setStatus('idle');
    }
  };

  const sharePhoto = async () => {
    if (!photoUri) return;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(photoUri);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingTop: safeTop + 12, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.push('/home')}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18, lineHeight: 22 }}>←</Text>
        </TouchableOpacity>
        <Text style={[fw(900), { fontSize: 18, color: colors.navy, flex: 1, textAlign: 'center', marginRight: 40 }]}>
          Your wall
        </Text>
      </View>

      <View style={{ flex: 1, padding: 24, gap: 16 }}>
        {photoUri ? (
          <View style={{ borderRadius: 20, overflow: 'hidden' }}>
            <Image source={{ uri: photoUri }} style={{ width: '100%', height: 260 }} resizeMode="cover" />
            {status === 'locked' && (
              <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.72)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 32 }}>🔒</Text>
                <Text style={[fw(800), { fontSize: 15, color: colors.navy, marginTop: 8 }]}>Wall — coming soon</Text>
                <Text style={[fw(600), { fontSize: 12, color: '#64748b', marginTop: 4, textAlign: 'center', paddingHorizontal: 24 }]}>
                  Your photo passed the food check ✓ — saving to a public wall is launching soon.
                </Text>
              </View>
            )}
            {status === 'uploading' && (
              <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={colors.orange} />
              </View>
            )}
          </View>
        ) : (
          <TouchableOpacity
            onPress={pickPhoto}
            style={{
              height: 260, borderRadius: 20, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(0,0,0,0.15)',
              alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Text style={{ fontSize: 40 }}>📷</Text>
            <Text style={[fw(700), { fontSize: 14, color: '#64748b' }]}>Take a photo of {params.dishName}</Text>
          </TouchableOpacity>
        )}

        {message && (
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: status === 'rejected' ? 'rgba(220,38,38,0.06)' : 'rgba(249,115,22,0.06)' }}>
            <Text style={[fw(600), { fontSize: 12, color: status === 'rejected' ? '#dc2626' : colors.orange }]}>{message}</Text>
          </View>
        )}

        {(status === 'rejected' || status === 'error') && (
          <TouchableOpacity onPress={() => { setPhotoUri(null); setStatus('idle'); setMessage(null); }} style={{ alignItems: 'center', padding: 10 }}>
            <Text style={[fw(700), { fontSize: 13, color: colors.orange }]}>Try another photo</Text>
          </TouchableOpacity>
        )}
      </View>

      {photoUri && (status === 'locked' || status === 'idle') && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 24 + safeBottom, backgroundColor: '#fff' }}>
          <TouchableOpacity activeOpacity={0.85} onPress={sharePhoto}>
            <LinearGradient colors={['#f97316', '#fbbf24']} style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[fw(900), { fontSize: 18, color: '#fff' }]}>📤 Share your dish</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
