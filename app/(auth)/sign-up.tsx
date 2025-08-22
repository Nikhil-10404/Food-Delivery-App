import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { createUser } from '@/lib/appwrite';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';

const SignUp = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });

  const submit = async () => {
    const { name, email, password, phone } = form;
    if (!name || !email || !password) {
      return Alert.alert("Error", "Please enter name, email, and password");
    }

    // simple phone normalization and sanity check (optional)
    const phoneDigits = (phone || "").replace(/\D/g, "");
    if (phone && phoneDigits.length < 7) {
      return Alert.alert("Invalid phone", "Please enter a valid phone number.");
    }

    setIsSubmitting(true);
    try {
      await createUser({
        email,
        password,
        name,
        phone: phoneDigits, // ✅ send to backend
      });

      Alert.alert("Success", "User signed up successfully");
      router.replace('/');
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Failed to sign up');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className='gap-10 bg-white rounded-lg p-5 mt-5 '>
      <CustomInput
        placeholder='Enter your Full Name'
        value={form.name}
        onChangeText={(text) => setForm((prev) => ({ ...prev, name: text }))}
        label="Full name"
      />

      <CustomInput
        placeholder='Enter your Email'
        value={form.email}
        onChangeText={(text) => setForm((prev) => ({ ...prev, email: text }))}
        label="Email"
        keyboardType='email-address'
      />

      {/* ✅ New: Phone number */}
      <CustomInput
        placeholder='Enter your Phone Number'
        value={form.phone}
        onChangeText={(text) => {
          // keep digits only as they type
          const digits = text.replace(/\D/g, '');
          setForm((prev) => ({ ...prev, phone: digits }));
        }}
        label="Phone number"
        keyboardType='phone-pad'
      />

      <CustomInput
        placeholder='Enter your Password'
        value={form.password}
        onChangeText={(text) => setForm((prev) => ({ ...prev, password: text }))}
        label="Password"
        secureTextEntry={true}
      />

      <CustomButton
        title="Sign-Up"
        isLoading={isSubmitting}
        onPress={submit}
      />

      <View className='flex justify-center mt-5 flex-row gap-2 '>
        <Text className='base-regular text-gray-100'>
          Already have an Account ?
        </Text>
        <Link href="/sign-in" className="base-bold text-primary">
          Sign-In
        </Link>
      </View>
    </View>
  );
};

export default SignUp;
