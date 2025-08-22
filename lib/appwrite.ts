import SignIn from "@/app/(auth)/sign-in";
import { CreateUserPrams, GetMenuParams, SignInParams } from "@/type";
import { Account, Avatars, Client, Databases, ID, Query, Storage } from "react-native-appwrite";
import { Models } from "react-native-appwrite";
import 'react-native-url-polyfill/auto';



export { ID };

export const appwriteConfig = {
  endpoint: process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT as string, // must be string
  platform: "com.yognik.fooddelivery",
  databaseId: "689f4cf400382bb1fa55",
  userCollectionId: "689f515a000fa3336a47",
  categoriesCollectionId:"68a20694001c3f17e5ae",
  menuCollectionId:"68a2079f000a0afb2ac1",
  customizationCollectionId:"68a20a3a001f3d3fbcd6",
  menuCustomizationCollectionId:"68a20b5800076dc7d810",
  bucketId:"68a20c42001aef95854e",
  apikey:"standard_7de18e47d6d481575ef51b7d22e9434c942b3121769a2f608d03c3a366211f00956c477a69171b4f7856e71e4b617f59d619485bfc8efa76b6be4e526a756750309429de92926a0a9d08e9e1e00633c63e2026e967c51cd1164a71c8f75d48742c7a4ba784203f0f60bfced5f74677045daa0d878609ebdbbaea7d0d8ff6933c",
  projectId: process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID as string,
};

export const client = new Client();

client
  .setEndpoint(appwriteConfig.endpoint!) // API endpoint
  .setProject(appwriteConfig.projectId!) // project ID
  .setPlatform(appwriteConfig.platform); // REQUIRED for react-native-appwrite

  export const account=new Account(client)
  export const databases=new Databases(client);
  const avatars=new Avatars(client);
  export const storage = new Storage(client)

  export const createUser =async({email,password,name}:CreateUserPrams)=>{
    try{
         const newAccount=await account.create(ID.unique(),email,password,name)
         if(!newAccount)throw Error;

         await signIn({email,password});

         const avatarUrl=avatars.getInitialsURL(name);

         return await databases.createDocument(
            appwriteConfig.databaseId,
            appwriteConfig.userCollectionId,
            ID.unique(),
            {   accountId:newAccount.$id,
                email,name,
                avatar:avatarUrl
            }
            
         )
    }catch(e){
        throw new Error(e as string)

    }
  }
   export const signIn=async({email,password}:SignInParams)=>{
          try{
         return await account.createEmailPasswordSession(email,password);
          }catch(e){
            throw new Error(e as string)
          }
    }

    export const getCurrentUser=async()=>{
        try{
            const currentAccount=await account.get();
            if(!currentAccount)throw Error;

            const currentUser=await databases.listDocuments(
                appwriteConfig.databaseId,
                appwriteConfig.userCollectionId,
                [Query.equal('accountId',currentAccount.$id)]
            )
            if (!currentUser) throw Error;
            return currentUser.documents[0];

        }catch(e){
            console.log(e);
            throw new Error(e as string);
        }
    }

    // Find the Appwrite Account ID from your Users collection by email
export const findAccountIdByEmail = async (email: string) => {
  const trimmed = (email || "").trim().toLowerCase();
  if (!trimmed) throw new Error("email_required");

  const res = await databases.listDocuments(
    appwriteConfig.databaseId,
    appwriteConfig.userCollectionId,
    [Query.equal("email", trimmed)]
  );

  if (!res || !res.documents?.length) {
    throw new Error("not_found");
  }

  const doc = res.documents[0] as any;
  if (!doc.accountId) throw new Error("no_accountId_on_user_doc");

  return String(doc.accountId);
};


    export const getMenu=async({category,query}:GetMenuParams)=>{
      try{
            const queries:string[]=[];
            if(category)queries.push(Query.equal('categories',category));
            if(query)queries.push(Query.search('name',query));
            const menus=await databases.listDocuments(
              appwriteConfig.databaseId,
              appwriteConfig.menuCollectionId,
              queries,
            )
            return  menus.documents;
      }catch(e){
        throw new Error(e as string);
      }

    }

    export const getCategories=async()=>{
      try{
                const categories=await databases.listDocuments(
                  appwriteConfig.databaseId,
                  appwriteConfig.categoriesCollectionId,
                )
                return categories.documents;
      }catch(e){
        throw new Error(e as string);
      }
    }
