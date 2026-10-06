// 6-digit code entry: visible boxes mirror one invisible TextInput, so paste
// and SMS/email one-time-code autofill work through textContentType/autoComplete.
import { forwardRef } from 'react';
import { Pressable, TextInput } from 'react-native';
import { space } from '@moodfood/tokens';
import { OtpBox } from '@moodfood/ui';

export const CODE_LENGTH = 6;

export const CodeInput = forwardRef<TextInput, { value: string; onChange: (code: string) => void; sms?: boolean }>(
  function CodeInput({ value, onChange, sms }, ref) {
    const focus = () => (ref && typeof ref !== 'function' ? ref.current?.focus() : undefined);
    return (
      <>
        <Pressable onPress={focus} accessibilityLabel="Enter verification code" style={{ marginHorizontal: space.gutter, marginTop: 10, flexDirection: 'row', gap: 8 }}>
          {Array.from({ length: CODE_LENGTH }, (_, k) => (
            <OtpBox key={k} digit={value[k]} state={value.length > k ? 'filled' : value.length === k ? 'active' : 'empty'} />
          ))}
        </Pressable>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete={sms ? 'sms-otp' : 'one-time-code'}
          maxLength={CODE_LENGTH}
          style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
        />
      </>
    );
  },
);
