import { router } from 'expo-router';
import React from 'react';
import { View, Text, Button } from 'react-native';

const SignIn = () => {
  return (
    <View>
      <Text>sign-in</Text>
      <Button title='Sign In' onPress={()=>router.push("/sign-up")}/>
    </View>
  );
};

export default SignIn;
