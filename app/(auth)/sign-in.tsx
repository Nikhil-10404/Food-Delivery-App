import CustomButton from '@/components/CustomButton';
import CustomInput from '@/components/CustomInput';
import { signIn } from '@/lib/appwrite';
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { View, Text, Button, Alert } from 'react-native';
import * as Sentry from '@sentry/react-native'
import useAuthStore from "@/store/auth.store";

const SignIn = () => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form,setForm]=useState({email:"",password:""})
   const fetchAuthenticatedUser = useAuthStore((s) => s.fetchAuthenticatedUser);
  const submit=async()=>{
    const{email,password}=form;
    if(!email||!password)return Alert.alert("Error","Please enter valid email and password")
    
    setIsSubmitting(true);

    try{
         await signIn({
          email,password
         });
         
       await fetchAuthenticatedUser();
      Alert.alert('Succes','User Signed-In Successfully');
      console.log("Calling signIn with", email);

      router.replace("/");
    }catch(error:any){
      Alert.alert('Error',error.message);
      Sentry.captureEvent(error);
    }finally{
      setIsSubmitting(false)
    }
  
    }
  
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
      Sign-Up</Link>
    </View>
    </View>
  );
};

export default SignIn;
