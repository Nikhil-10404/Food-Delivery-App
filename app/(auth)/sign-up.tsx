import { View, Text,Button } from 'react-native'
import React from 'react'
import { router } from 'expo-router';

const Signup = () => {
  return (
    <View>
      <Text>Sign-up</Text>
      <Button title='Sign In' onPress={()=>router.push("/sign-in")}/>
    </View>
  )
}

export default Signup;