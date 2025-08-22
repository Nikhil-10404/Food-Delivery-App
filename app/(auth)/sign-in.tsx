import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { signIn, findAccountIdByEmail } from '@/lib/appwrite';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { View, Text, Alert, TouchableOpacity } from 'react-native';
import * as Sentry from '@sentry/react-native';
import useAuthStore from "@/store/auth.store";

const SignIn = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const fetchAuthenticatedUser = useAuthStore((s) => s.fetchAuthenticatedUser);

  const submit = async () => {
    const { email, password } = form;
    if (!email || !password) {
      return Alert.alert("Error", "Please enter valid email and password");
    }

    setIsSubmitting(true);
    try {
      await signIn({ email, password });
      await fetchAuthenticatedUser();
      Alert.alert('Success', 'User Signed-In Successfully');
      router.replace("/");
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Sign-in failed');
      Sentry.captureException(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const beginPasswordReset = async () => {
    const email = form.email.trim();
    if (!email) {
      Alert.alert("Email required", "Please enter your email first so we can send the code.");
      return;
    }
    try {
      const accountId = await findAccountIdByEmail(email);
      router.push(`/reset-password/otp?userId=${encodeURIComponent(accountId)}` as any);
    } catch (e: any) {
      if (e?.message === "not_found") {
        Alert.alert("No account found", "We couldn't find a user with that email.");
      } else {
        Alert.alert("Error", e?.message ?? "Could not start password reset.");
      }
    }
  };

  return (
    <View className='gap-10 bg-white rounded-lg p-5 mt-5 '>
      <CustomInput
        placeholder='Enter your Email'
        value={form.email}
        onChangeText={(text) => setForm((prev) => ({ ...prev, email: text }))}
        label="Email"
        keyboardType='email-address'
      />

      <CustomInput
        placeholder='Enter your Password'
        value={form.password}
        onChangeText={(text) => setForm((prev) => ({ ...prev, password: text }))}
        label="Password"
        secureTextEntry={true}
      />

      {/* Forgot password link */}
      <View className="mt-[-10] mb-1">
        <TouchableOpacity onPress={beginPasswordReset} activeOpacity={0.7}>
          <Text className="text-orange-600 font-medium text-right">Forgot password?</Text>
        </TouchableOpacity>
      </View>

      <CustomButton
        title="Sign-In"
        isLoading={isSubmitting}
        onPress={submit}
      />

      <View className='flex justify-center mt-5 flex-row gap-2 '>
        <Text className='base-regular text-gray-100'>
          Don't have an Account ?
        </Text>
        <Link href="/sign-up" className="base-bold text-primary">
          Sign-Up
        </Link>
      </View>
    </View>
  );
};

export default SignIn;
