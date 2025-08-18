import { View, Text, SafeAreaView, FlatList } from 'react-native'
import React from 'react'
import { useCartStore } from '@/store/cart.store'
import CustomHeader from '@/components/CustomHeader';
import cn from "clsx";
import { CartItemType, PaymentInfoStripeProps } from '@/type';
import CustomButton from '@/components/CustomButton';
import CartItem from '@/components/Cartitem';

const PaymentInfoStripe = ({ label,  value,  labelStyle,  valueStyle, }:PaymentInfoStripeProps) => (
    <View className="flex-between flex-row my-1">
        <Text className={cn("paragraph-medium text-gray-200", labelStyle)}>
            {label}
        </Text>
        <Text className={cn("paragraph-bold text-dark-100", valueStyle)}>
            {value}
        </Text>
    </View>
);

const Card = () => {
  const {items,getTotalItems,getTotalPrice}=useCartStore();

  const totalItems=getTotalItems();
  const totalPrice=getTotalPrice();

  return (
    <SafeAreaView className='bg-white h-full '>
      <FlatList data={items}
        renderItem={({ item }: { item:CartItemType }) => (
    <CartItem item={item} />
  )}

      keyExtractor={(item)=>item.id}
      contentContainerClassName='pb-28 px-5 pt-20'
      ListHeaderComponent={()=><CustomHeader title='Your Cart'/>}
      ListEmptyComponent={()=><Text>Cart Empty</Text>}
      ListFooterComponent={()=>totalItems>0&&(
        <View className='gap-5'>
          <View className='mt-6 border-gray-200 rounded-2xl p5'>
            <Text className='h3-bold text-dark-100 mb-5'>
              Payment Summary
            </Text>
            <PaymentInfoStripe 
            label={`Total Items(${totalItems})`}
            value={`${totalPrice.toFixed(2)}`}
            />
            <PaymentInfoStripe 
            label={`Deloivery Fee`}
            value={`$5.00`}
            />
            <PaymentInfoStripe 
            label={`Discount`}
            value={`-$0.50`}
            valueStyle='!text-success'
            />
            <View className='border-t border-gray-300 my-2'/>
            <PaymentInfoStripe 
            label={`Total`}
            value={`${(totalPrice+5-0.5).toFixed(2)}`}
            labelStyle='base-bold text-dark-100'
            valueStyle='base-bold !text-dark-100 !text-right'
            />
          </View>
          <CustomButton title='Order Now'/>
        </View>
      )}
/>
    </SafeAreaView>
  )
}

export default Card