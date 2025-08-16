import { View, Text } from 'react-native'
import React from 'react'
import { Slot, Redirect } from "expo-router";

export default function Layout() {
  const isAuthenticated = true; // replace with real auth state

  if (!isAuthenticated) {
    return <Redirect href="/sign-in" />;
  }

  return <Slot />;
}
