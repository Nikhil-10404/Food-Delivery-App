import { View, Text, SafeAreaView, Button,Alert, FlatList } from 'react-native'
import React, { useEffect } from 'react'
import useAppwrite from '@/lib/useAppwrite'
import { getCategories, getMenu } from '@/lib/appwrite';
import { useLocalSearchParams } from 'expo-router';
import CartButton from '@/components/CardButton';
import cn from "clsx";
import MenuCard from '@/components/MenuCard';
import { MenuItem } from '@/type';
import SearchBar from '@/components/SearchBar';
import Filter from '@/components/Filter';

const Search=()=>{

  const {category,query}=useLocalSearchParams<{query:string; category:string}>()

  const {data,refetch, loading}=useAppwrite({
       fn:getMenu,
       params:{
        category,
        query,
        limit:6,
       }
  });

  const {data:categories}=useAppwrite({
    fn:getCategories

  })

  useEffect(()=>{
          refetch({category,query,limit:6});
  },[category,query]);

  // console.log(data);

  return(
    <SafeAreaView className='bg-white h-full'>
      <FlatList 
      data={data} 
      renderItem={({item,index})=>{
        const isFirstRightColItem=index%2===0;

             return(
              <View className={cn('flex-1 max-w-[48%]',!isFirstRightColItem?'mt-10':'mt-0')}>
               <MenuCard item={item as unknown as MenuItem} />

              </View>
             )
}}
         keyExtractor={item=>item.$id}
         numColumns={2}  
         columnWrapperClassName='gap-7'
         contentContainerClassName='gap-7 px-5 pb-32 pt-10'
         ListHeaderComponent={()=>(
          <View className='my-5 gap-5'>
            <View className='flex-between flex-row w-full'>
              <View className='flex-start'>
                <Text className='small-bold uppercase text-primary'>
                  Search
                </Text>
                <View className='flex-start flex-row gap-x-1 mt-5'>
                  <Text className='paragraph-semibold text-dark-100'>Find your Favourite Food</Text>
                </View>
              </View>
              <CartButton/>
            </View>
            <Text><SearchBar/></Text>
            <Text><Filter categories={categories!}/></Text>
          </View>
         )}
        ListEmptyComponent={()=>!loading&&<Text>NO results</Text>}
 />
    </SafeAreaView>
  )
}


export default Search