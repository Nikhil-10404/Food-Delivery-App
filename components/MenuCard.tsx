import { View, Text, TouchableOpacity, Image, Platform } from 'react-native'
import React from 'react'
import { MenuItem } from '@/type'
import { appwriteConfig } from '@/lib/appwrite'
import "../app/globals.css";
import { useCartStore } from '@/store/cart.store';

const MenuCard = ({item:{$id,image_url,name,price}}:{item:MenuItem}) => {
  
    const imageurl=`${image_url}?project=${appwriteConfig.projectId}`;
    const{addItem}=useCartStore();

  return (
    <TouchableOpacity className='menu-card' style={Platform.OS==='android'?{ shadowColor:'#878787'}:{}}>
        <Image source={{uri:imageurl}} className='size-[90px] absolute top-[-1px]' resizeMode='contain' />
        <Text className='text-center base-bold text-dark-100 mb-2' numberOfLines={1 }>{name}</Text>
        <Text className='body-regular text-gray-200 mb-4'>From ${price}</Text>
        <TouchableOpacity onPress={()=>addItem({id:$id,name,price,image_url:imageurl,customizations:[]})} >
            <Text className='paragraph-bold text-primary'>Add to cart +</Text>
        </TouchableOpacity>
    </TouchableOpacity>
  )
}

export default MenuCard