import { SafeAreaView } from "react-native-safe-area-context";
import "../globals.css"
import { FlatList, Pressable, Text, View,Image, TouchableOpacity,Button } from "react-native";
import {images, offers} from "@/constants"
import { Fragment, useEffect } from "react";
import cn from 'clsx';
import CartButton from "@/components/CardButton";
import * as Sentry from '@sentry/react-native'
import useAuthStore from "@/store/auth.store";
import { client } from "@/lib/appwrite";
import { Client } from "react-native-appwrite";
import 'react-native-url-polyfill/auto';

import { account } from "@/lib/appwrite";

async function testConnection() {
  try {
    const res = await account.createAnonymousSession();
    console.log("Connected to Appwrite ✅", res);
  } catch (err) {
    console.log("Appwrite connection failed ❌", err);
  }
}

// const Client1 = new Client()
//   .setEndpoint("https://fra.cloud.appwrite.io/v1")
//   .setProject("your-project-id");

// console.log(client.config);



export default function Index() {
  const {user}=useAuthStore();
  console.log("User",JSON.stringify(user,null,2));
   useEffect(() => {
    testConnection(); // ✅ call it here
  }, []);
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-between flex-row w-full my-5 px-5">
        <View className="flex-start">
          <Text className="small-bold text-primary">
            DELIVER TO
          </Text>
          <TouchableOpacity className="flex-center flex-row gap-x-1 mt-0.5">
             <Text className="paragraph-bold text-dark-100"> India </Text>
             <Image source={images.arrowDown} className="size-3" resizeMode="contain"/>

          </TouchableOpacity>
         
        </View>
        <CartButton/>
      </View>
  <FlatList
    data={offers}
    keyExtractor={(item, index) => index.toString()}
    renderItem={({ item, index }) => {
      const isEven = index % 2 === 0;
      return (
        <View>
          <Pressable
             className={cn("offer-card", isEven ? 'flex-row-reverse' : 'flex-row')}
             style={{ backgroundColor: item.color }}
             android_ripple={{color:"#fffff22"}}         
              >
             {({ pressed }) => (
             <Fragment>
              <View className={"h-full w-1/2"}>
              <Image source={item.image} className={"size-full"} resizeMode={"contain"} />
               </View>

               <View className={cn("offer-card__info", isEven ? 'pl-10': 'pr-10')}>
                <Text className="h1-bold text-white leading-tight">
                  {item.title}
                </Text>
                   <Image 
                    source={images.arrowRight}
                    className="size-10"
                    resizeMode="contain"
                    tintColor="#ffffff"

                   />                       
                </View>
                </Fragment>
                )}
            </Pressable>
        </View>
      );
    }}
    contentContainerClassName="pb-28 px-5"
   
  />
</SafeAreaView>

  );
}