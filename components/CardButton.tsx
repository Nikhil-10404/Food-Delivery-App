import {View, Text, TouchableOpacity, Image} from 'react-native'
import React from 'react'
import {images} from "@/constants";
import {router} from "expo-router";
import "../app/globals.css"
const CartButton = () => {
    const totalItems = 10;

    return (
        <TouchableOpacity className="w-10 h-10 rounded-full bg-black flex items-center justify-center" onPress={()=> {}}>
            <Image source={images.bag} className="size-7" resizeMode="contain" />

            {totalItems > 0 && (
                <View className="cart-badge">
                    <Text className="small-bold text-white">{totalItems}</Text>
                </View>
            )}
        </TouchableOpacity>
    )
}
export default CartButton