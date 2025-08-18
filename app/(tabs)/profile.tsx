import React from "react";
import { View } from "react-native";
import { Client, Account } from "appwrite";
import LogoutButton from "@/components/LogoutButton";


const client = new Client()
  .setEndpoint("https://fra.cloud.appwrite.io/v1")
  .setProject("689f4acb0019f2d2bc66");

const account = new Account(client);

const Profile = () => {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      {/* Other profile info */}
        
      <LogoutButton account={account} />
    </View>
  );
};

export default Profile;
